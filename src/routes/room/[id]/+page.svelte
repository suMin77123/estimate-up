<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { PlanningPokerHost } from '../../../lib/webrtc/host.js';
	import { PlanningPokerGuest } from '../../../lib/webrtc/guest.js';
	import type { Room, User } from '../../../lib/types.js';
	import AnswerCodeModal from '../../../lib/components/AnswerCodeModal.svelte';
	import AnswerCodeDisplay from '../../../lib/components/AnswerCodeDisplay.svelte';

	// URL 파라미터
	$: roomId = $page.params.id;
	$: isHost = $page.url.searchParams.get('host') === 'true';
	$: isJoining = $page.url.searchParams.has('join');
	$: userName = $page.url.searchParams.get('name') || '';

	// 상태 변수들
	let room: Room | null = null;
	let selectedCard: string | null = null;
	let host: PlanningPokerHost | null = null;
	let guest: PlanningPokerGuest | null = null;
	let shareLink = '';
	let errorMessage = '';
	let loading = true;
	let showLinkCopied = false;
	let showAnswerModal = false;
	let showAnswerCodeDisplay = false;
	let answerCodeToDisplay = '';
	let connected = false;

	// 카드 덱
	const cards = [
		'1/4',
		'1/2',
		'1',
		'2',
		'3',
		'4',
		'5',
		'6',
		'7',
		'8',
		'9',
		'?',
		'🍕',
		'🍔',
		'🍟',
		'🌭',
		'🥙',
		'🌮',
		'🍜',
		'🍣'
	];

	// 컨트롤 버튼 상태
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
		if (!browser) {
			console.log('SSR environment, skipping initialization');
			return;
		}

		console.log('🚀 Initializing room page...');
		console.log(
			`Room ID: ${roomId}, Is Host: ${isHost}, Is Joining: ${isJoining}, User: ${userName}`
		);

		// 게스트가 이름 없이 링크로 직접 접근한 경우 참가 페이지로 리다이렉트
		if (isJoining && !userName) {
			const joinCode = $page.url.searchParams.get('join');
			console.log('Redirecting to join page...');
			goto(`/room/${roomId}/join?join=${joinCode}`);
			return;
		}

		try {
			if (isHost) {
				console.log('🏠 Initializing as host...');
				await initializeHost();
			} else if (isJoining && userName) {
				console.log('👤 Initializing as guest...');
				await initializeGuest();
			} else {
				console.log('❌ Invalid access, redirecting to home...');
				goto('/');
			}
		} catch (error) {
			console.error('❌ Initialization failed:', error);
			errorMessage = '방 접속에 실패했습니다: ' + (error as Error).message;
			loading = false;
		}
	});

	// 호스트 초기화
	async function initializeHost() {
		try {
			console.log('🏠 Creating host instance...');
			host = new PlanningPokerHost(roomId, userName);

			// 초기 room 정보를 즉시 설정
			room = host.getRoom();
			console.log('📊 Initial room set:', room.gameState, room.participants.size, 'participants');

			host.onRoomUpdate((updatedRoom) => {
				console.log(
					'📊 Room updated:',
					updatedRoom.gameState,
					updatedRoom.participants.size,
					'participants'
				);
				room = updatedRoom;
			});

			console.log('📋 Generating join link...');
			// 참가 링크 생성
			shareLink = await host.generateJoinLink(window.location.origin);
			connected = true;
			loading = false;
			console.log('✅ Host initialization completed');
		} catch (error) {
			console.error('❌ Failed to initialize host:', error);
			errorMessage = '방 생성에 실패했습니다: ' + (error as Error).message;
			loading = false;
			throw error;
		}
	}

	// 게스트 초기화
	async function initializeGuest() {
		try {
			console.log('👤 Creating guest instance...');
			guest = new PlanningPokerGuest(userName);

			// 초기 room 정보를 즉시 설정
			room = guest.getRoom();
			console.log(
				'📊 Initial room set for guest:',
				room?.gameState,
				room?.participants.size,
				'participants'
			);

			guest.onRoomUpdate((updatedRoom) => {
				console.log(
					'📊 Room updated:',
					updatedRoom.gameState,
					updatedRoom.participants.size,
					'participants'
				);
				room = updatedRoom;
			});

			guest.onConnectionStateChange((isConnected) => {
				console.log('🔗 Connection state changed:', isConnected);
				connected = isConnected;
				if (!isConnected) {
					errorMessage = '연결이 끊어졌습니다.';
				}
			});

			// URL에서 join 코드 추출
			const joinCode = $page.url.searchParams.get('join');
			if (!joinCode) {
				throw new Error('참가 정보가 없습니다.');
			}

			console.log('🔄 Joining room with join code length:', joinCode.length);
			console.log('🔄 Join code preview:', joinCode.substring(0, 50) + '...');

			// 방 참가 시도
			const answerCode = await guest.joinRoomFromLink(joinCode);

			console.log('📋 Answer code generated, length:', answerCode.length);
			console.log('📋 Answer code preview:', answerCode.substring(0, 50) + '...');

			// Answer 코드를 사용자에게 표시 (호스트에게 전달해야 함)
			showAnswerCode(answerCode);
			console.log('✅ Guest initialization completed');
		} catch (error) {
			console.error('❌ Failed to initialize guest:', error);
			errorMessage = (error as Error).message;
			loading = false;
			throw error;
		}
	}

	// Answer 코드를 사용자에게 표시
	function showAnswerCode(answerCode: string) {
		console.log('📋 Showing answer code to user');
		console.log('📋 Answer code length:', answerCode.length);
		console.log('📋 Setting showAnswerCodeDisplay to true');

		answerCodeToDisplay = answerCode;
		showAnswerCodeDisplay = true;
		loading = false;

		console.log('📋 State after setting:', {
			showAnswerCodeDisplay,
			answerCodeToDisplay: answerCodeToDisplay.length,
			loading
		});
	}

	function closeAnswerCodeDisplay() {
		showAnswerCodeDisplay = false;
		answerCodeToDisplay = '';
	}

	// 카드 선택
	function handleCardSelect(card: string) {
		if (isHost || selectedCard === card || room?.gameState !== 'voting' || !guest) return;

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
		selectedCard = null;
	}

	// Answer 모달 컨트롤
	function openAnswerModal() {
		showAnswerModal = true;
	}

	function closeAnswerModal() {
		showAnswerModal = false;
	}

	async function handleAnswerCode(answerCode: string) {
		if (!host) throw new Error('호스트가 초기화되지 않았습니다');
		await host.handleNewParticipant(answerCode);
	}

	// 링크 복사
	async function copyShareLink() {
		try {
			await navigator.clipboard.writeText(shareLink);
			showLinkCopied = true;
			setTimeout(() => {
				showLinkCopied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy link:', error);
		}
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
{:else if showAnswerCodeDisplay}
	<!-- Answer 코드 표시 -->
	<AnswerCodeDisplay answerCode={answerCodeToDisplay} onClose={closeAnswerCodeDisplay} />
{:else if room}
	<main class="game-container">
		<!-- 상단 정보 바 -->
		<header class="info-bar">
			<div class="room-info">
				<h1>🎯 방 {roomId}</h1>
				<p class="participants-count">{room.participants.size}명 참가 중</p>
			</div>

			{#if isHost}
				<div class="host-buttons">
					<button class="share-button" on:click={copyShareLink}>
						{#if showLinkCopied}
							✅ 복사됨!
						{:else}
							📋 링크 공유
						{/if}
					</button>
					<button class="add-button" on:click={openAnswerModal}> 👥 참가자 추가 </button>
				</div>
			{/if}
		</header>

		<!-- 원형 참가자 배치 및 중앙 탁자 -->
		<div class="game-area">
			<div class="circle-container">
				{#each Array.from(room.participants.values()) as participant, index}
					{@const totalParticipants = room.participants.size}
					{@const angle = (index * 360) / totalParticipants}
					{@const radius = 150}
					{@const x = Math.cos(((angle - 90) * Math.PI) / 180) * radius}
					{@const y = Math.sin(((angle - 90) * Math.PI) / 180) * radius}

					<div
						class="participant-circle"
						class:host={participant.isHost}
						style="transform: translate({x}px, {y}px)"
					>
						<div class="participant-avatar">
							<span class="participant-name">{participant.name}</span>
							{#if participant.isHost}
								<div class="host-crown">👑</div>
							{/if}
						</div>

						<!-- 카드 상태 표시 -->
						<div class="card-display">
							{#if room.gameState === 'voting' && !participant.isHost}
								{#if participant.selectedCard}
									<div class="card-back">🎴</div>
								{:else}
									<div class="waiting-indicator">⏳</div>
								{/if}
							{:else if room.gameState === 'revealed' && participant.selectedCard}
								<div class="revealed-card">
									{participant.selectedCard}
								</div>
							{/if}
						</div>
					</div>
				{/each}

				<!-- 중앙 탁자 -->
				<div class="center-table">
					<div class="table-surface">
						<div class="table-content">
							{#if room.gameState === 'waiting'}
								<div class="table-status">
									<span class="status-icon">🕐</span>
									<span class="status-text">대기 중</span>
								</div>
							{:else if room.gameState === 'voting'}
								<div class="table-status">
									<span class="status-icon">🗳️</span>
									<span class="status-text">투표 중</span>
								</div>
							{:else if room.gameState === 'revealed'}
								<div class="table-results">
									{#if room.results}
										<div class="result-summary">
											<div class="avg-result">
												<span class="result-label">평균</span>
												<span class="result-value">{room.results.average.toFixed(1)}</span>
											</div>
											<div class="total-result">
												<span class="result-label">합계</span>
												<span class="result-value">{room.results.total}</span>
											</div>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- 상세 결과 (revealed 상태일 때만) -->
		{#if room.gameState === 'revealed' && room.results}
			<div class="detailed-results">
				<h3>📊 투표 결과</h3>
				<div class="vote-breakdown">
					<div class="vote-cards-display">
						{#each room.results.votes as vote}
							<span class="vote-card-detail">{vote}</span>
						{/each}
					</div>
				</div>
			</div>
		{/if}

		<!-- 카드 선택 영역 (게스트만) -->
		{#if !isHost && room.gameState === 'voting' && room.cards}
			<div class="card-selection">
				<h3>카드 선택</h3>
				<div class="cards-grid">
					{#each room.cards as card}
						<button
							class="card"
							class:selected={selectedCard === card}
							on:click={() => handleCardSelect(card)}
						>
							{card}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<!-- 호스트 컨트롤 -->
		{#if isHost}
			<footer class="host-controls">
				<button class="control-button start" disabled={!canStartVoting} on:click={startVoting}>
					🗳️ 투표 시작
				</button>
				<button class="control-button reveal" disabled={!canRevealCards} on:click={revealCards}>
					🎲 카드 공개
				</button>
				<button class="control-button next" disabled={!canNextRound} on:click={nextRound}>
					🔄 다음 라운드
				</button>
			</footer>
		{/if}
	</main>

	<!-- Answer 코드 입력 모달 -->
	<AnswerCodeModal
		showModal={showAnswerModal}
		onSubmit={handleAnswerCode}
		onClose={closeAnswerModal}
	/>
{/if}

<style>
	.loading-container,
	.error-container {
		@apply flex min-h-screen flex-col items-center justify-center;
		@apply bg-gradient-to-br from-blue-50 to-green-50 p-4;
	}

	.spinner {
		@apply mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600;
	}

	.error-message {
		@apply mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700;
	}

	.retry-button {
		@apply rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700;
	}

	.game-container {
		@apply min-h-screen bg-gradient-to-br from-blue-50 to-green-50;
		@apply flex flex-col;
	}

	.info-bar {
		@apply flex items-center justify-between bg-white p-4 shadow-sm;
	}

	.room-info h1 {
		@apply text-xl font-bold text-gray-800;
	}

	.participants-count {
		@apply text-sm text-gray-600;
	}

	.host-buttons {
		@apply flex gap-2;
	}

	.share-button {
		@apply rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700;
	}

	.add-button {
		@apply rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700;
	}

	.game-area {
		@apply flex flex-1 items-center justify-center p-4;
		@apply relative;
		min-height: 500px;
	}

	.circle-container {
		@apply relative;
		@apply flex items-center justify-center;
		width: 400px;
		height: 400px;
	}

	.participant-circle {
		@apply absolute;
		@apply flex flex-col items-center gap-2;
		@apply transition-all duration-300;
	}

	.participant-circle.host {
		@apply scale-110 transform;
	}

	.participant-avatar {
		@apply relative flex flex-col items-center gap-1;
		@apply rounded-full bg-white shadow-lg;
		@apply flex h-16 w-16 items-center justify-center;
		@apply border-2 border-gray-200;
	}

	.participant-circle.host .participant-avatar {
		@apply border-blue-400 bg-blue-50;
	}

	.participant-name {
		@apply text-center text-xs font-medium text-gray-700;
		@apply max-w-16 truncate;
	}

	.participant-circle.host .participant-name {
		@apply text-blue-700;
	}

	.host-crown {
		@apply absolute -right-2 -top-2;
		@apply text-sm;
	}

	.card-display {
		@apply mt-1;
	}

	.card-back {
		@apply rounded bg-blue-500 px-2 py-1 text-sm font-bold text-white;
	}

	.waiting-indicator {
		@apply text-sm text-gray-400;
	}

	.revealed-card {
		@apply rounded bg-green-500 px-2 py-1 text-sm font-bold text-white;
		@apply min-w-8 text-center;
	}

	.center-table {
		@apply absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform;
		@apply h-32 w-32;
	}

	.table-surface {
		@apply h-full w-full rounded-full;
		@apply bg-gradient-to-br from-green-100 to-green-200;
		@apply border-4 border-green-300;
		@apply shadow-lg;
		@apply flex items-center justify-center;
	}

	.table-content {
		@apply text-center;
	}

	.table-status {
		@apply flex flex-col items-center gap-1;
	}

	.status-icon {
		@apply text-2xl;
	}

	.status-text {
		@apply text-xs font-medium text-gray-700;
	}

	.table-results {
		@apply flex flex-col items-center;
	}

	.result-summary {
		@apply space-y-1;
	}

	.avg-result,
	.total-result {
		@apply flex flex-col items-center;
	}

	.result-label {
		@apply text-xs text-gray-600;
	}

	.result-value {
		@apply text-sm font-bold text-green-700;
	}

	.detailed-results {
		@apply border-t border-gray-200 bg-white p-6;
	}

	.detailed-results h3 {
		@apply mb-4 text-center text-lg font-bold text-gray-800;
	}

	.vote-breakdown {
		@apply text-center;
	}

	.vote-cards-display {
		@apply flex flex-wrap justify-center gap-2;
	}

	.vote-card-detail {
		@apply rounded-lg bg-gray-100 px-3 py-2 font-bold text-gray-700;
		@apply border border-gray-300;
	}

	.card-selection {
		@apply border-t border-gray-200 bg-white p-6 shadow-lg;
	}

	.card-selection h3 {
		@apply mb-4 text-center text-lg font-bold text-gray-800;
	}

	.cards-grid {
		@apply grid grid-cols-4 gap-3 md:grid-cols-6 lg:grid-cols-8;
		@apply mx-auto max-w-2xl;
	}

	.card {
		@apply rounded-lg border-2 border-gray-200 bg-white p-4 shadow-sm;
		@apply transition-all hover:border-blue-300 hover:shadow-md;
		@apply text-lg font-bold text-gray-700;
		@apply flex aspect-square items-center justify-center;
	}

	.card.selected {
		@apply border-blue-500 bg-blue-50 text-blue-700;
	}

	.host-controls {
		@apply border-t border-gray-200 bg-white p-6;
		@apply flex justify-center gap-4;
		@apply shadow-lg;
	}

	.control-button {
		@apply rounded-lg px-6 py-3 font-bold transition-all;
		@apply disabled:cursor-not-allowed disabled:opacity-50;
	}

	.control-button.start {
		@apply bg-blue-600 text-white hover:bg-blue-700;
	}

	.control-button.reveal {
		@apply bg-green-600 text-white hover:bg-green-700;
	}

	.control-button.next {
		@apply bg-purple-600 text-white hover:bg-purple-700;
	}
</style>
