<script lang="ts">
	export let showModal = false;
	export let onSubmit: (answerCode: string) => Promise<void>;
	export let onClose: () => void;

	let answerCode = '';
	let loading = false;
	let errorMessage = '';

	async function handleSubmit() {
		if (!answerCode.trim()) {
			errorMessage = 'Answer 코드를 입력해주세요';
			return;
		}

		loading = true;
		errorMessage = '';

		try {
			await onSubmit(answerCode.trim());
			answerCode = '';
			onClose();
		} catch (error) {
			errorMessage = (error as Error).message;
		} finally {
			loading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			handleSubmit();
		} else if (event.key === 'Escape') {
			onClose();
		}
	}

	function clearError() {
		errorMessage = '';
	}
</script>

{#if showModal}
	<div class="modal-overlay" on:click={onClose}>
		<div class="modal" on:click|stopPropagation on:keydown={handleKeydown}>
			<h3>참가자 추가</h3>
			<p>참가자가 제공한 Answer 코드를 입력하세요:</p>

			<div class="form-group">
				<label for="answer-code">Answer 코드</label>
				<textarea
					id="answer-code"
					bind:value={answerCode}
					placeholder="참가자의 Answer 코드를 붙여넣으세요"
					rows="4"
					disabled={loading}
					on:input={clearError}
				></textarea>
			</div>

			{#if errorMessage}
				<div class="error-message">
					⚠️ {errorMessage}
				</div>
			{/if}

			<div class="button-group">
				<button class="secondary-button" on:click={onClose} disabled={loading}> 취소 </button>
				<button
					class="primary-button"
					on:click={handleSubmit}
					disabled={loading || !answerCode.trim()}
				>
					{#if loading}
						연결 중...
					{:else}
						참가자 추가
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		@apply fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50;
	}

	.modal {
		@apply mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl;
	}

	.modal h3 {
		@apply mb-4 text-lg font-bold;
	}

	.modal p {
		@apply mb-4 text-sm text-gray-600;
	}

	.form-group {
		@apply mb-4;
	}

	.form-group label {
		@apply mb-2 block text-sm font-medium text-gray-700;
	}

	.form-group textarea {
		@apply w-full rounded-lg border border-gray-300 px-3 py-2;
		@apply focus:border-transparent focus:ring-2 focus:ring-blue-500;
		@apply resize-none transition-colors;
		@apply disabled:cursor-not-allowed disabled:bg-gray-100;
	}

	.error-message {
		@apply rounded-lg border border-red-200 bg-red-50 p-3;
		@apply mb-4 text-sm text-red-700;
	}

	.button-group {
		@apply flex gap-3;
	}

	.primary-button {
		@apply flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white;
		@apply hover:bg-blue-700 focus:ring-2 focus:ring-blue-500;
		@apply disabled:cursor-not-allowed disabled:opacity-50;
		@apply font-medium transition-colors;
	}

	.secondary-button {
		@apply flex-1 rounded-lg bg-gray-600 px-4 py-2 text-white;
		@apply hover:bg-gray-700 focus:ring-2 focus:ring-gray-500;
		@apply disabled:cursor-not-allowed disabled:opacity-50;
		@apply font-medium transition-colors;
	}
</style>
