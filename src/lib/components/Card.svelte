<script lang="ts">
	import { isFoodEmoji } from '../stores/game.js';

	export let card: string;
	export let selected = false;
	export let revealed = false;
	export let hidden = false;
	export let onClick: (() => void) | undefined = undefined;

	$: isFraction = card.includes('/');
	$: isQuestion = card === '?';
	$: isFood = isFoodEmoji(card);
</script>

<button
	class="card"
	class:selected
	class:fraction={isFraction}
	class:question={isQuestion}
	class:food={isFood}
	class:hidden
	class:revealed
	disabled={!onClick}
	on:click={onClick}
>
	{#if hidden && !revealed}
		?
	{:else}
		{card}
	{/if}
</button>

<style>
	.card {
		@apply h-16 w-12 rounded-lg border-2 border-gray-300 bg-white;
		@apply flex items-center justify-center text-lg font-bold;
		@apply transition-colors hover:border-blue-500;
		@apply md:h-20 md:w-14 md:text-xl;
		@apply disabled:cursor-default;
	}

	.card.selected {
		@apply border-blue-500 bg-blue-50;
	}

	.card.fraction {
		@apply text-sm md:text-base;
	}

	.card.question {
		@apply text-2xl text-purple-600 md:text-3xl;
	}

	.card.food {
		@apply text-2xl md:text-3xl;
	}

	.card.hidden {
		@apply border-blue-300 bg-blue-100 text-blue-600;
	}

	.card.revealed {
		@apply border-green-300 bg-green-50;
	}

	.card:not(:disabled):hover {
		@apply scale-105 transform border-blue-500 shadow-md;
	}
</style>
