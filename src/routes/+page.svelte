<script lang="ts">
	import { goto } from '$app/navigation';
	import { generateRoomId } from '../lib/stores/game.js';

	let hostName = '';
	let guestName = '';
	let roomLink = '';
	let errorMessage = '';

	function createRoom() {
		if (!hostName.trim()) {
			errorMessage = '이름을 입력해주세요';
			return;
		}

		const roomId = generateRoomId();
		goto(`/room/${roomId}?host=true&name=${encodeURIComponent(hostName.trim())}`);
	}

	function joinRoom() {
		if (!guestName.trim()) {
			errorMessage = '이름을 입력해주세요';
			return;
		}

		if (!roomLink.trim()) {
			errorMessage = '방 링크를 입력해주세요';
			return;
		}

		try {
			const url = new URL(roomLink);
			const pathParts = url.pathname.split('/');
			const roomId = pathParts[pathParts.length - 1];

			if (!roomId) {
				throw new Error('Invalid room link');
			}

			goto(`/room/${roomId}?guest=true&name=${encodeURIComponent(guestName.trim())}`);
		} catch (error) {
			errorMessage = '올바른 방 링크를 입력해주세요';
		}
	}

	function clearError() {
		errorMessage = '';
	}
</script>

<svelte:head>
	<title>Estimate Up - Planning Poker</title>
</svelte:head>

<main class="main-container">
	<div class="content">
		<header class="header">
			<h1 class="title">🎯 Estimate Up</h1>
			<p class="subtitle">Planning Poker로 팀과 함께 추정해보세요</p>
		</header>

		<div class="cards-container">
			<!-- 방 만들기 카드 -->
			<div class="card">
				<div class="card-header">
					<div class="icon">👑</div>
					<h2>방 만들기</h2>
				</div>

				<div class="card-body">
					<p class="description">새로운 Planning Poker 방을 만들고 팀원들을 초대하세요</p>

					<div class="form-group">
						<label for="host-name">방장 이름</label>
						<input
							id="host-name"
							type="text"
							placeholder="이름을 입력하세요"
							bind:value={hostName}
							on:input={clearError}
							on:keydown={(e) => e.key === 'Enter' && createRoom()}
						/>
					</div>

					<button class="primary-button" on:click={createRoom}> 방 만들기 </button>
				</div>
			</div>

			<!-- 방 참가하기 카드 -->
			<div class="card">
				<div class="card-header">
					<div class="icon">🚪</div>
					<h2>방 참가하기</h2>
				</div>

				<div class="card-body">
					<p class="description">방장이 공유한 링크로 Planning Poker에 참가하세요</p>

					<div class="form-group">
						<label for="guest-name">참가자 이름</label>
						<input
							id="guest-name"
							type="text"
							placeholder="이름을 입력하세요"
							bind:value={guestName}
							on:input={clearError}
						/>
					</div>

					<div class="form-group">
						<label for="room-link">방 링크</label>
						<input
							id="room-link"
							type="text"
							placeholder="방 링크를 붙여넣으세요"
							bind:value={roomLink}
							on:input={clearError}
							on:keydown={(e) => e.key === 'Enter' && joinRoom()}
						/>
					</div>

					<button class="secondary-button" on:click={joinRoom}> 방 참가하기 </button>
				</div>
			</div>
		</div>

		{#if errorMessage}
			<div class="error-message">
				⚠️ {errorMessage}
			</div>
		{/if}

		<footer class="footer">
			<div class="features">
				<div class="feature">
					<span class="feature-icon">🔗</span>
					<span>링크로 간편 공유</span>
				</div>
				<div class="feature">
					<span class="feature-icon">🎴</span>
					<span>다양한 카드 시스템</span>
				</div>
				<div class="feature">
					<span class="feature-icon">📱</span>
					<span>모바일 친화적</span>
				</div>
				<div class="feature">
					<span class="feature-icon">🔒</span>
					<span>완전 서버리스</span>
				</div>
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
		@apply w-full max-w-4xl;
	}

	.header {
		@apply mb-8 text-center;
	}

	.title {
		@apply mb-2 text-4xl font-bold text-gray-800 md:text-6xl;
	}

	.subtitle {
		@apply text-lg text-gray-600 md:text-xl;
	}

	.cards-container {
		@apply mb-6 grid gap-6 md:grid-cols-2;
	}

	.card {
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
	}

	.primary-button {
		@apply w-full rounded-lg bg-blue-600 px-6 py-3 text-white;
		@apply hover:bg-blue-700 focus:ring-2 focus:ring-blue-500;
		@apply font-medium transition-colors;
	}

	.secondary-button {
		@apply w-full rounded-lg bg-green-600 px-6 py-3 text-white;
		@apply hover:bg-green-700 focus:ring-2 focus:ring-green-500;
		@apply font-medium transition-colors;
	}

	.error-message {
		@apply rounded-lg border border-red-200 bg-red-50 p-4 text-center;
		@apply font-medium text-red-700;
	}

	.footer {
		@apply mt-8;
	}

	.features {
		@apply grid grid-cols-2 gap-4 md:grid-cols-4;
		@apply text-center;
	}

	.feature {
		@apply rounded-lg bg-white p-4 shadow-sm;
		@apply flex flex-col items-center gap-2;
	}

	.feature-icon {
		@apply text-2xl;
	}

	.feature span:last-child {
		@apply text-sm text-gray-600;
	}
</style>
