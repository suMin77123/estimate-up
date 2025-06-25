<script lang="ts">
	import type { Room } from '../types.js';
	import { calculateStats } from '../stores/game.js';

	export let room: Room;

	$: participants = Array.from(room.participants.values()).filter((p) => !p.isHost);
	$: votes = Object.fromEntries(
		participants.filter((p) => p.selectedCard).map((p) => [p.id, p.selectedCard!])
	);
	$: stats = calculateStats(votes);
	$: allSelected = participants.length > 0 && participants.every((p) => p.selectedCard);
</script>

<div class="table-container">
	<div class="table">
		{#if room.gameState === 'revealed'}
			<div class="results">
				<div class="stats-grid">
					<div class="stat">
						<div class="label">평균</div>
						<div class="value">{stats.average}</div>
					</div>
					<div class="stat">
						<div class="label">총합</div>
						<div class="value">{stats.total}</div>
					</div>
				</div>

				{#if stats.questionCount > 0 || stats.foodCount > 0}
					<div class="special-votes">
						{#if stats.questionCount > 0}
							<span class="question-badge">? × {stats.questionCount}</span>
						{/if}
						{#if stats.foodCount > 0}
							<span class="food-badge">🍕 × {stats.foodCount}</span>
						{/if}
					</div>
				{/if}
			</div>
		{:else if room.gameState === 'voting'}
			<div class="voting-status">
				<div class="progress-info">
					<div class="round-info">라운드 {room.currentRound}</div>
					<div class="vote-count">
						{participants.filter((p) => p.selectedCard).length} / {participants.length} 투표 완료
					</div>
				</div>

				{#if allSelected}
					<div class="all-voted">✅ 모든 투표 완료!</div>
				{/if}
			</div>
		{:else}
			<div class="waiting-state">
				<div class="welcome">
					<h3>Planning Poker</h3>
					<p>라운드 {room.currentRound}</p>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.table-container {
		@apply flex items-center justify-center;
	}

	.table {
		@apply h-32 w-32 md:h-40 md:w-40;
		@apply rounded-full border-4 border-green-300 bg-green-100;
		@apply flex items-center justify-center;
		@apply shadow-lg;
	}

	.results {
		@apply text-center;
	}

	.stats-grid {
		@apply mb-2 grid grid-cols-2 gap-2;
	}

	.stat {
		@apply text-center;
	}

	.label {
		@apply text-xs text-gray-600 md:text-sm;
	}

	.value {
		@apply text-lg font-bold text-green-700 md:text-xl;
	}

	.special-votes {
		@apply flex flex-wrap justify-center gap-1;
	}

	.question-badge {
		@apply rounded bg-purple-100 px-2 py-1 text-xs text-purple-700;
	}

	.food-badge {
		@apply rounded bg-orange-100 px-2 py-1 text-xs text-orange-700;
	}

	.voting-status {
		@apply text-center;
	}

	.progress-info {
		@apply space-y-1;
	}

	.round-info {
		@apply text-sm font-semibold text-gray-700 md:text-base;
	}

	.vote-count {
		@apply text-xs text-gray-600 md:text-sm;
	}

	.all-voted {
		@apply mt-2 text-xs font-semibold text-green-600 md:text-sm;
	}

	.waiting-state {
		@apply text-center;
	}

	.welcome h3 {
		@apply text-sm font-bold text-gray-700 md:text-base;
	}

	.welcome p {
		@apply text-xs text-gray-500 md:text-sm;
	}
</style>
