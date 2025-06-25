<script lang="ts">
	export let answerCode: string;
	export let onClose: () => void;

	let copied = false;
	let copyError = '';

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(answerCode);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			console.error('Failed to copy:', error);
			copyError = '복사에 실패했습니다. 수동으로 복사해주세요.';
		}
	}

	function selectAll() {
		const textarea = document.getElementById('answer-code') as HTMLTextAreaElement;
		if (textarea) {
			textarea.select();
		}
	}
</script>

<div class="answer-code-overlay" on:click={onClose}>
	<div class="answer-code-modal" on:click|stopPropagation>
		<div class="modal-header">
			<h3>🎯 참가 코드 생성 완료!</h3>
			<button class="close-button" on:click={onClose}>✕</button>
		</div>

		<div class="modal-content">
			<div class="instruction">
				<p>아래 코드를 <strong>방장에게 전달</strong>해주세요:</p>
				<p class="sub-text">방장이 "참가자 추가" 버튼을 눌러 이 코드를 입력하면 연결됩니다.</p>
			</div>

			<div class="code-container">
				<label for="answer-code">참가 코드</label>
				<div class="code-input-group">
					<textarea
						id="answer-code"
						value={answerCode}
						readonly
						rows="4"
						on:click={selectAll}
						placeholder="참가 코드가 여기에 표시됩니다"
					></textarea>
					<button class="copy-button" on:click={copyToClipboard}>
						{#if copied}
							✅ 복사됨!
						{:else}
							📋 복사
						{/if}
					</button>
				</div>
			</div>

			{#if copyError}
				<div class="error-message">
					⚠️ {copyError}
				</div>
			{/if}

			<div class="help-text">
				<div class="help-item">
					<span class="help-icon">📱</span>
					<span>카카오톡, 슬랙 등으로 방장에게 전송</span>
				</div>
				<div class="help-item">
					<span class="help-icon">📋</span>
					<span>복사 버튼을 눌러 클립보드에 저장</span>
				</div>
				<div class="help-item">
					<span class="help-icon">⏳</span>
					<span>방장이 코드를 입력하면 자동으로 연결됩니다</span>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<button class="close-modal-button" on:click={onClose}> 확인 </button>
		</div>
	</div>
</div>

<style>
	.answer-code-overlay {
		@apply fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50;
		@apply p-4;
	}

	.answer-code-modal {
		@apply w-full max-w-lg rounded-xl bg-white shadow-2xl;
		@apply max-h-[90vh] overflow-y-auto;
	}

	.modal-header {
		@apply flex items-center justify-between border-b border-gray-200 p-6;
	}

	.modal-header h3 {
		@apply text-xl font-bold text-gray-800;
	}

	.close-button {
		@apply rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600;
		@apply transition-colors;
	}

	.modal-content {
		@apply p-6;
	}

	.instruction {
		@apply mb-6;
	}

	.instruction p {
		@apply text-gray-700;
	}

	.instruction .sub-text {
		@apply mt-2 text-sm text-gray-500;
	}

	.code-container {
		@apply mb-6;
	}

	.code-container label {
		@apply mb-2 block text-sm font-medium text-gray-700;
	}

	.code-input-group {
		@apply relative;
	}

	.code-input-group textarea {
		@apply w-full rounded-lg border border-gray-300 px-4 py-3;
		@apply bg-gray-50 font-mono text-sm text-gray-800;
		@apply resize-none transition-colors;
		@apply focus:border-blue-500 focus:ring-2 focus:ring-blue-500;
	}

	.copy-button {
		@apply absolute right-2 top-2 rounded-md bg-blue-600 px-3 py-1;
		@apply text-xs font-medium text-white;
		@apply hover:bg-blue-700 focus:ring-2 focus:ring-blue-500;
		@apply transition-colors;
	}

	.error-message {
		@apply rounded-lg border border-red-200 bg-red-50 p-3;
		@apply mb-4 text-sm text-red-700;
	}

	.help-text {
		@apply space-y-3 rounded-lg bg-blue-50 p-4;
	}

	.help-item {
		@apply flex items-center gap-3 text-sm text-blue-800;
	}

	.help-icon {
		@apply text-lg;
	}

	.modal-footer {
		@apply border-t border-gray-200 p-6;
		@apply flex justify-end;
	}

	.close-modal-button {
		@apply rounded-lg bg-blue-600 px-6 py-2 text-white;
		@apply hover:bg-blue-700 focus:ring-2 focus:ring-blue-500;
		@apply font-medium transition-colors;
	}
</style>
