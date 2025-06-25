<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	import Table from '../../../lib/components/Table.svelte';
	import ParticipantCircle from '../../../lib/components/ParticipantCircle.svelte';
	import CardDeck from '../../../lib/components/CardDeck.svelte';

	import { PlanningPokerHost } from '../../../lib/webrtc/host.js';
	import { PlanningPokerGuest } from '../../../lib/webrtc/guest.js';

	import type { Room, User } from '../../../lib/types.js';

	// URL 파라미터
	$: roomId = $page.params.id;
	$: isHost = $page.url.searchParams.get('host') === 'true';
	$: isGuest = $page.url.searchParams.get('guest') === 'true';
	$: userName = $page.url.searchParams.get('name') || '';

	// 상태 변수들
	let room: Room | null = null;
	let selectedCard: string | null = null;
	let host: PlanningPokerHost | null = null;
	let guest: PlanningPokerGuest | null = null;
	let connected = false;
	let showShareModal = false;
	let shareLink = '';
	let errorMessage = '';
	let loading = true;

	// 호스트 컨트롤 버튼 상태
	$: canStartVoting = room?.gameState === 'waiting' && room.participants.size > 1;
	$: canRevealCards = room?.gameState === 'voting' && areAllCardsSelected();
	$: canNextRound = room?.gameState === 'revealed';

	function areAllCardsSelected(): boolean {
		if (!room) return false;
		const nonHostParticipants = Array.from(room.participants.values()).filter((p) => !p.isHost);
		return nonHostParticipants.length > 0 && nonHostParticipants.every((p) => p.selectedCard);
	}

	// 방 초기화
	onMount(async () => {
		if (!browser) return;

		try {
			if (isHost) {
				await initializeHost();
			} else if (isGuest) {
				await initializeGuest();
			} else {
				// 잘못된 접근
				goto('/');
			}
		} catch (error) {
			console.error('Initialization failed:', error);
			errorMessage = '방 접속에 실패했습니다.';
			loading = false;
		}
	});

	// 호스트 초기화
	async function initializeHost() {
		host = new PlanningPokerHost(roomId, userName);

		host.onRoomUpdate((updatedRoom) => {
			room = updatedRoom;
			loading = false;
		});

		// 공유 링크 생성
		shareLink = `${window.location.origin}/room/${roomId}`;
		connected = true;
		loading = false;
	}

	// 게스트 초기화
	async function initializeGuest() {
		guest = new PlanningPokerGuest(userName);

		guest.onRoomUpdate((updatedRoom) => {
			room = updatedRoom;
			loading = false;
		});

		guest.onConnectionStateChange((isConnected) => {
			connected = isConnected;
			if (!isConnected) {
				errorMessage = '연결이 끊어졌습니다.';
			}
		});

		// URL에서 Offer 데이터 추출 (실제로는 더 복잡한 연결 과정이 필요)
		// 여기서는 단순화된 버전으로 구현
		loading = false;
		errorMessage = 'WebRTC 연결 기능은 추가 구현이 필요합니다.';
	}

	// 카드 선택 (게스트만)
	function handleCardSelect(card: string) {
		if (!guest || selectedCard === card) return;

		selectedCard = card;
		guest.selectCard(card);
	}

	// 호스트 컨트롤 함수들
	function startVoting() {
		if (!host) return;
		host.changeGameState('voting');
	}

	function revealCards() {
		if (!host) return;
		host.changeGameState('revealed');
	}

	function nextRound() {
		if (!host) return;
		host.nextRound();
		selectedCard = null; // 카드 선택 초기화
	}

	// 공유 모달
	function openShareModal() {
		showShareModal = true;
	}

	function closeShareModal() {
		showShareModal = false;
	}

	function copyLink() {
		navigator.clipboard.writeText(shareLink);
		// 복사 완료 알림
	}

	// 참가자 클릭 (이모티콘 전송용)
	function handleParticipantClick(participant: User) {
		// 이모티콘 선택 모달 표시
		console.log('Participant clicked:', participant);
	}

	// 정리
	onDestroy(() => {
		host?.cleanup();
		guest?.disconnect();
	});
</script>

<svelte:head>
	<title>방 {roomId} - Estimate Up</title>
</svelte:head>

{#if loading}
	<div class="loading-container">
		<div class="spinner"></div>
		<p>방에 접속 중...</p>
	</div>
{:else if errorMessage}
	<div class="error-container">
		<div class="error-message">
			⚠️ {errorMessage}
		</div>
		<button class="retry-button" on:click={() => goto('/')}> 홈으로 돌아가기 </button>
	</div>
{:else if room}
	<main class="game-container">
		<!-- 상단 정보 바 -->
		<header class="info-bar">
			<div class="room-info">
				<h1>방 {roomId}</h1>
				<div class="connection-status" class:connected class:disconnected={!connected}>
					{connected ? '연결됨' : '연결 끊김'}
				</div>
			</div>

			{#if isHost}
				<button class="share-button" on:click={openShareModal}> 📋 링크 공유 </button>
			{/if}
		</header>

		<!-- 게임 영역 -->
		<div class="game-area">
			<!-- 참가자들과 중앙 탁자 -->
			<div class="circle-area">
				<ParticipantCircle {room} onParticipantClick={handleParticipantClick} />
				<div class="table-wrapper">
					<Table {room} />
				</div>
			</div>
		</div>

		<!-- 하단 컨트롤 영역 -->
		<footer class="controls">
			{#if isHost}
				<!-- 호스트 컨트롤 -->
				<div class="host-controls">
					<button class="control-button primary" disabled={!canStartVoting} on:click={startVoting}>
						투표 시작
					</button>
					<button
						class="control-button secondary"
						disabled={!canRevealCards}
						on:click={revealCards}
					>
						카드 공개
					</button>
					<button class="control-button accent" disabled={!canNextRound} on:click={nextRound}>
						다음 라운드
					</button>
				</div>
			{:else}
				<!-- 게스트 카드 선택 -->
				<div class="guest-controls">
					{#if room.gameState === 'voting'}
						<div class="card-selection">
							<p class="instruction">카드를 선택하세요</p>
							<CardDeck cards={room.cards} {selectedCard} onCardSelect={handleCardSelect} />
						</div>
					{:else if room.gameState === 'waiting'}
						<div class="waiting-message">방장이 투표를 시작할 때까지 기다려주세요</div>
					{:else}
						<div class="revealed-message">결과가 공개되었습니다</div>
					{/if}
				</div>
			{/if}
		</footer>
	</main>

	<!-- 공유 모달 -->
	{#if showShareModal}
		<div class="modal-overlay" on:click={closeShareModal}>
			<div class="modal" on:click|stopPropagation>
				<h3>방 링크 공유</h3>
				<p>이 링크를 팀원들에게 공유하세요:</p>
				<div class="link-container">
					<input type="text" value={shareLink} readonly />
					<button on:click={copyLink}>복사</button>
				</div>
				<button class="close-button" on:click={closeShareModal}>닫기</button>
			</div>
		</div>
	{/if}
{/if}

<style>
	.loading-container,
	.error-container {
		@apply flex min-h-screen flex-col items-center justify-center;
		@apply bg-gradient-to-br from-blue-50 to-green-50;
	}

	.spinner {
		@apply h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600;
	}

	.error-message {
		@apply mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700;
	}

	.retry-button {
		@apply rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700;
	}

	.game-container {
		@apply min-h-screen bg-gradient-to-br from-blue-50 to-green-50;
		@apply flex flex-col;
	}

	.info-bar {
		@apply flex items-center justify-between bg-white p-4 shadow-sm;
	}

	.room-info h1 {
		@apply text-lg font-bold text-gray-800;
	}

	.connection-status {
		@apply rounded px-2 py-1 text-sm;
	}

	.connection-status.connected {
		@apply bg-green-100 text-green-700;
	}

	.connection-status.disconnected {
		@apply bg-red-100 text-red-700;
	}

	.share-button {
		@apply rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700;
	}

	.game-area {
		@apply flex flex-1 items-center justify-center p-4;
		@apply relative;
	}

	.circle-area {
		@apply relative w-full max-w-lg;
		@apply aspect-square;
	}

	.table-wrapper {
		@apply absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform;
	}

	.controls {
		@apply border-t border-gray-200 bg-white p-4;
	}

	.host-controls {
		@apply flex justify-center gap-3;
	}

	.control-button {
		@apply rounded-lg px-6 py-3 font-medium;
		@apply disabled:cursor-not-allowed disabled:opacity-50;
	}

	.control-button.primary {
		@apply bg-blue-600 text-white hover:bg-blue-700;
	}

	.control-button.secondary {
		@apply bg-green-600 text-white hover:bg-green-700;
	}

	.control-button.accent {
		@apply bg-purple-600 text-white hover:bg-purple-700;
	}

	.guest-controls {
		@apply text-center;
	}

	.card-selection .instruction {
		@apply mb-3 text-sm text-gray-600;
	}

	.waiting-message,
	.revealed-message {
		@apply rounded-lg border border-blue-200 bg-blue-50 p-4;
		@apply text-blue-700;
	}

	.modal-overlay {
		@apply bg-opacity-50 fixed inset-0 z-50 flex items-center justify-center bg-black;
	}

	.modal {
		@apply mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl;
	}

	.modal h3 {
		@apply mb-4 text-lg font-bold;
	}

	.link-container {
		@apply my-4 flex gap-2;
	}

	.link-container input {
		@apply flex-1 rounded border border-gray-300 px-3 py-2;
	}

	.link-container button {
		@apply rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700;
	}

	.close-button {
		@apply w-full rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700;
	}
</style>
