<script lang="ts">
	import type { User, Room } from '../types.js';
	import Card from './Card.svelte';

	export let room: Room;
	export let onParticipantClick: (participant: User) => void = () => {};

	$: participants = Array.from(room.participants.values());
	$: nonHostParticipants = participants.filter((p) => !p.isHost);
	$: hostParticipant = participants.find((p) => p.isHost);

	function getParticipantPosition(index: number, total: number) {
		const angle = (360 / total) * index;
		const radius = 120; // 중앙에서의 거리

		return {
			transform: `rotate(${angle}deg) translate(0, -${radius}px) rotate(-${angle}deg)`
		};
	}
</script>

<div class="circle-container">
	<!-- 일반 참가자들 원형 배치 -->
	{#each nonHostParticipants as participant, index}
		<div
			class="participant"
			style={`transform: ${getParticipantPosition(index, nonHostParticipants.length).transform}`}
		>
			<button
				class="participant-button"
				class:connected={participant.connected}
				class:disconnected={!participant.connected}
				on:click={() => onParticipantClick(participant)}
			>
				<div class="name">{participant.name}</div>

				{#if participant.selectedCard}
					<Card
						card={participant.selectedCard}
						hidden={room.gameState !== 'revealed'}
						revealed={room.gameState === 'revealed'}
					/>
				{:else if room.gameState === 'voting'}
					<div class="no-card">카드 선택 중...</div>
				{:else}
					<div class="no-card">대기 중</div>
				{/if}

				<div class="connection-indicator">
					{#if participant.connected}
						<div class="dot connected"></div>
					{:else}
						<div class="dot disconnected"></div>
					{/if}
				</div>
			</button>
		</div>
	{/each}

	<!-- 호스트 표시 (하단 고정) -->
	{#if hostParticipant}
		<div class="host-position">
			<div class="host-indicator">
				<div class="crown">👑</div>
				<div class="host-name">{hostParticipant.name} (방장)</div>
				<div class="host-status">
					{#if room.gameState === 'waiting'}
						게임 준비 중
					{:else if room.gameState === 'voting'}
						투표 진행 중
					{:else}
						결과 공개됨
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.circle-container {
		@apply relative h-full w-full;
		@apply flex items-center justify-center;
		min-height: 300px;
	}

	.participant {
		@apply absolute;
	}

	.participant-button {
		@apply flex flex-col items-center gap-1 p-2;
		@apply rounded-lg border-2 bg-white shadow-md;
		@apply transition-all hover:shadow-lg;
		@apply cursor-pointer;
	}

	.participant-button.connected {
		@apply border-green-300;
	}

	.participant-button.disconnected {
		@apply border-red-300 opacity-60;
	}

	.name {
		@apply text-xs font-semibold text-gray-700;
		@apply md:text-sm;
		@apply max-w-20 truncate;
	}

	.no-card {
		@apply text-center text-xs text-gray-500;
		@apply h-16 w-12 md:h-20 md:w-14;
		@apply flex items-center justify-center;
		@apply rounded-lg border-2 border-dashed border-gray-300;
	}

	.connection-indicator {
		@apply absolute -top-1 -right-1;
	}

	.dot {
		@apply h-3 w-3 rounded-full;
	}

	.dot.connected {
		@apply bg-green-500;
	}

	.dot.disconnected {
		@apply bg-red-500;
	}

	.host-position {
		@apply absolute bottom-0;
		@apply flex items-center justify-center;
	}

	.host-indicator {
		@apply p-3 text-center;
		@apply rounded-lg border-2 border-yellow-200 bg-yellow-50;
		@apply shadow-md;
	}

	.crown {
		@apply text-2xl;
	}

	.host-name {
		@apply text-sm font-bold text-gray-700;
		@apply md:text-base;
	}

	.host-status {
		@apply text-xs text-gray-500;
		@apply md:text-sm;
	}
</style>
