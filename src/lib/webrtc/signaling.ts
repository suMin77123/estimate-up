// WebRTC 시그널링 및 연결 관리 유틸리티

export interface ConnectionData {
	offer: RTCSessionDescriptionInit;
	roomId: string;
	hostName: string;
	timestamp: number;
}

export interface AnswerData {
	answer: RTCSessionDescriptionInit;
	participantName: string;
	participantId: string;
}

export class SignalingManager {
	// Offer를 URL로 인코딩
	static encodeOffer(connectionData: ConnectionData): string {
		const compressed = JSON.stringify(connectionData);
		return btoa(compressed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	}

	// URL에서 Offer 디코딩
	static decodeOffer(encodedOffer: string): ConnectionData {
		const padded = encodedOffer.replace(/-/g, '+').replace(/_/g, '/');
		const padding = '='.repeat((4 - (padded.length % 4)) % 4);
		const decoded = atob(padded + padding);
		return JSON.parse(decoded);
	}

	// Answer를 클립보드용으로 인코딩
	static encodeAnswer(answerData: AnswerData): string {
		const compressed = JSON.stringify(answerData);
		return btoa(compressed);
	}

	// Answer 디코딩
	static decodeAnswer(encodedAnswer: string): AnswerData {
		const decoded = atob(encodedAnswer);
		return JSON.parse(decoded);
	}

	// 참가 링크 생성
	static createJoinLink(baseUrl: string, roomId: string, encodedOffer: string): string {
		return `${baseUrl}/room/${roomId}?join=${encodedOffer}`;
	}

	// QR코드용 텍스트 생성
	static createQRText(answerCode: string): string {
		return `POKER:${answerCode}`;
	}

	// QR코드에서 Answer 추출
	static parseQRText(qrText: string): string | null {
		if (qrText.startsWith('POKER:')) {
			return qrText.substring(6);
		}
		return null;
	}
}

// ICE candidate 수집 도우미
export class ICEManager {
	private candidates: RTCIceCandidate[] = [];
	private onCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;

	constructor(private peerConnection: RTCPeerConnection) {
		this.peerConnection.onicecandidate = (event) => {
			if (event.candidate) {
				this.candidates.push(event.candidate);
				this.onCandidateCallback?.(event.candidate);
			}
		};
	}

	onCandidate(callback: (candidate: RTCIceCandidate) => void): void {
		this.onCandidateCallback = callback;
		// 이미 수집된 candidate들 전달
		this.candidates.forEach(callback);
	}

	async waitForCandidates(timeout: number = 3000): Promise<RTCIceCandidate[]> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				resolve(this.candidates);
			}, timeout);

			this.peerConnection.onicegatheringstatechange = () => {
				if (this.peerConnection.iceGatheringState === 'complete') {
					clearTimeout(timer);
					resolve(this.candidates);
				}
			};
		});
	}
}

// 연결 상태 모니터링
export class ConnectionMonitor {
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 3;
	private reconnectDelay = 1000;

	constructor(
		private peerConnection: RTCPeerConnection,
		private onReconnect: () => Promise<void>,
		private onFailure: () => void
	) {
		this.peerConnection.onconnectionstatechange = () => {
			this.handleConnectionStateChange();
		};
	}

	private handleConnectionStateChange(): void {
		const state = this.peerConnection.connectionState;

		switch (state) {
			case 'connected':
				this.reconnectAttempts = 0;
				console.log('WebRTC connection established');
				break;

			case 'disconnected':
				console.log('WebRTC connection disconnected, attempting reconnect...');
				this.attemptReconnect();
				break;

			case 'failed':
				console.log('WebRTC connection failed');
				this.attemptReconnect();
				break;

			case 'closed':
				console.log('WebRTC connection closed');
				break;
		}
	}

	private async attemptReconnect(): Promise<void> {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.log('Max reconnect attempts reached');
			this.onFailure();
			return;
		}

		this.reconnectAttempts++;

		setTimeout(async () => {
			try {
				await this.onReconnect();
			} catch (error) {
				console.error('Reconnect failed:', error);
				this.attemptReconnect();
			}
		}, this.reconnectDelay * this.reconnectAttempts);
	}
}
