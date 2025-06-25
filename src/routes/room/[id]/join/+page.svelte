<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	$: roomId = $page.params.id;

	let participantName = '';
	let errorMessage = '';
	let loading = false;

	// URL에서 join 코드 확인
	onMount(() => {
		const joinCode = $page.url.searchParams.get('join');
		if (!joinCode) {
			errorMessage = '유효하지 않은 방 링크입니다.';
		}
	});

	async function joinRoom() {
		if (!participantName.trim()) {
			errorMessage = '이름을 입력해주세요';
			return;
		}

		loading = true;
		errorMessage = '';

		try {
			const joinCode = $page.url.searchParams.get('join');
			if (!joinCode) {
				throw new Error('유효하지 않은 방 링크입니다.');
			}

			// 방 페이지로 이동 (join 코드와 이름 포함)
			const params = new URLSearchParams({
				join: joinCode,
				name: participantName.trim()
			});

			goto(`/room/${roomId}?${params.toString()}`);
		} catch (error) {
			errorMessage = (error as Error).message;
			loading = false;
		}
	}

	function clearError() {
		errorMessage = '';
	}
</script>

<svelte:head>
	<title>방 참가 - Estimate Up</title>
</svelte:head>

<main class="main-container">
	<div class="content">
		<header class="header">
			<h1 class="title">🎯 Planning Poker</h1>
			<p class="subtitle">방 {roomId}에 참가하기</p>
		</header>

		<div class="join-container">
			<div class="join-card">
				<div class="card-header">
					<div class="icon">👤</div>
					<h2>참가자 정보</h2>
				</div>

				<div class="card-body">
					<p class="description">Planning Poker에 참가하기 위해 이름을 입력해주세요</p>

					<div class="form-group">
						<label for="participant-name">참가자 이름</label>
						<input
							id="participant-name"
							type="text"
							placeholder="이름을 입력하세요"
							bind:value={participantName}
							on:input={clearError}
							on:keydown={(e) => e.key === 'Enter' && joinRoom()}
							disabled={loading}
							class:error={errorMessage}
						/>
					</div>

					{#if errorMessage}
						<div class="error-message">
							⚠️ {errorMessage}
						</div>
					{/if}

					<button
						class="join-button"
						on:click={joinRoom}
						disabled={loading || !participantName.trim()}
					>
						{#if loading}
							🔄 방 참가 중...
						{:else}
							🚀 방 참가하기
						{/if}
					</button>

					<button class="back-button" on:click={() => goto('/')}> ← 홈으로 돌아가기 </button>
				</div>
			</div>
		</div>

		<footer class="footer">
			<div class="info">
				<p>✨ 서버리스 실시간 Planning Poker</p>
				<p>🔒 완전히 안전한 P2P 연결</p>
			</div>
		</footer>
	</div>
</main>

<style>
	.main-container {
		@apply min-h-screen bg-gradient-to-br from-blue-50 to-green-50;
		@apply flex items-center justify-center p-4;
	}

	.content {
		@apply w-full max-w-md;
	}

	.header {
		@apply mb-8 text-center;
	}

	.title {
		@apply mb-2 text-3xl font-bold text-gray-800 md:text-4xl;
	}

	.subtitle {
		@apply text-lg text-gray-600;
	}

	.join-container {
		@apply mb-6;
	}

	.join-card {
		@apply rounded-xl border border-gray-200 bg-white shadow-lg;
		@apply transition-shadow hover:shadow-xl;
	}

	.card-header {
		@apply border-b border-gray-100 p-6;
		@apply flex items-center gap-3;
	}

	.icon {
		@apply text-3xl;
	}

	.card-header h2 {
		@apply text-xl font-bold text-gray-800;
	}

	.card-body {
		@apply space-y-4 p-6;
	}

	.description {
		@apply text-sm text-gray-600 md:text-base;
	}

	.form-group {
		@apply space-y-2;
	}

	.form-group label {
		@apply block text-sm font-medium text-gray-700;
	}

	.form-group input {
		@apply w-full rounded-lg border border-gray-300 px-4 py-3;
		@apply focus:border-transparent focus:ring-2 focus:ring-blue-500;
		@apply transition-colors;
		@apply disabled:cursor-not-allowed disabled:bg-gray-100;
	}

	.form-group input.error {
		@apply border-red-300 focus:ring-red-500;
	}

	.error-message {
		@apply rounded-lg border border-red-200 bg-red-50 p-3;
		@apply text-sm text-red-700;
	}

	.join-button {
		@apply w-full rounded-lg bg-green-600 px-6 py-4 text-white;
		@apply hover:bg-green-700 focus:ring-2 focus:ring-green-500;
		@apply text-lg font-bold transition-colors;
		@apply disabled:cursor-not-allowed disabled:opacity-50;
		@apply shadow-lg hover:shadow-xl;
	}

	.back-button {
		@apply w-full rounded-lg bg-gray-100 px-4 py-2 text-gray-700;
		@apply transition-colors hover:bg-gray-200;
		@apply text-sm;
	}

	.footer {
		@apply text-center;
	}

	.info {
		@apply space-y-1;
	}

	.info p {
		@apply text-sm text-gray-500;
	}
</style>
