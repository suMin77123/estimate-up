<script lang="ts">
	import Card from './Card.svelte';

	export let cards: string[];
	export let selectedCard: string | null = null;
	export let onCardSelect: (card: string) => void;
</script>

<div class="card-deck">
	{#each cards as card}
		<Card {card} selected={selectedCard === card} onClick={() => onCardSelect(card)} />
	{/each}
</div>

<style>
	.card-deck {
		@apply flex gap-2 overflow-x-auto pb-2;
		@apply justify-center md:justify-center;
		scrollbar-width: thin;
	}

	.card-deck::-webkit-scrollbar {
		height: 4px;
	}

	.card-deck::-webkit-scrollbar-track {
		@apply rounded bg-gray-100;
	}

	.card-deck::-webkit-scrollbar-thumb {
		@apply rounded bg-gray-300;
	}
</style>
