// WebRTC 시그널링 및 연결 관리 유틸리티

export interface ConnectionData {
	offer: RTCSessionDescriptionInit;
	iceCandidates: RTCIceCandidateInit[];
	roomId: string;
	hostName: string;
	timestamp: number;
}

export interface AnswerData {
	answer: RTCSessionDescriptionInit;
	iceCandidates: RTCIceCandidateInit[];
	participantName: string;
	participantId: string;
}

export class SignalingManager {
	// Offer를 URL로 인코딩 (압축 개선)
	static encodeOffer(connectionData: ConnectionData): string {
		try {
			const compressed = JSON.stringify(connectionData);
			const encoded = btoa(compressed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
			return encoded;
		} catch (error) {
			console.error('Failed to encode offer:', error);
			throw new Error('연결 정보 인코딩에 실패했습니다');
		}
	}

	// URL에서 Offer 디코딩
	static decodeOffer(encodedOffer: string): ConnectionData {
		try {
			const padded = encodedOffer.replace(/-/g, '+').replace(/_/g, '/');
			const padding = '='.repeat((4 - (padded.length % 4)) % 4);
			const decoded = atob(padded + padding);
			return JSON.parse(decoded);
		} catch (error) {
			console.error('Failed to decode offer:', error);
			throw new Error('연결 정보 디코딩에 실패했습니다');
		}
	}

	// Answer를 클립보드용으로 인코딩
	static encodeAnswer(answerData: AnswerData): string {
		try {
			const compressed = JSON.stringify(answerData);
			return btoa(compressed);
		} catch (error) {
			console.error('Failed to encode answer:', error);
			throw new Error('응답 정보 인코딩에 실패했습니다');
		}
	}

	// Answer 디코딩
	static decodeAnswer(encodedAnswer: string): AnswerData {
		try {
			const decoded = atob(encodedAnswer);
			return JSON.parse(decoded);
		} catch (error) {
			console.error('Failed to decode answer:', error);
			throw new Error('응답 정보 디코딩에 실패했습니다');
		}
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

	// 코드 길이 검증
	static validateAnswerCode(code: string): boolean {
		try {
			const decoded = atob(code);
			const data = JSON.parse(decoded);
			return data.answer && data.participantName && data.participantId;
		} catch {
			return false;
		}
	}
}

// ICE candidate 수집 도우미 (개선)
export class ICEManager {
	private candidates: RTCIceCandidate[] = [];
	private onCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;
	private gatheringComplete = false;

	constructor(private peerConnection: RTCPeerConnection) {
		this.peerConnection.onicecandidate = (event) => {
			if (event.candidate) {
				this.candidates.push(event.candidate);
				this.onCandidateCallback?.(event.candidate);
			} else {
				// candidate가 null이면 수집 완료
				this.gatheringComplete = true;
			}
		};
	}

	onCandidate(callback: (candidate: RTCIceCandidate) => void): void {
		this.onCandidateCallback = callback;
		// 이미 수집된 candidate들 전달
		this.candidates.forEach(callback);
	}

	async waitForCandidates(timeout: number = 15000): Promise<RTCIceCandidate[]> {
		return new Promise((resolve) => {
			// 이미 수집 완료되었으면 바로 반환
			if (this.gatheringComplete) {
				console.log(`✅ ICE candidates already collected: ${this.candidates.length}`);
				resolve(this.candidates);
				return;
			}

			const timer = setTimeout(() => {
				console.warn(
					`⚠️ ICE candidate gathering timeout after ${timeout}ms, using ${this.candidates.length} collected candidates`
				);
				resolve(this.candidates);
			}, timeout);

			const checkComplete = () => {
				if (this.peerConnection.iceGatheringState === 'complete' || this.gatheringComplete) {
					clearTimeout(timer);
					console.log(`✅ ICE candidate gathering completed: ${this.candidates.length} candidates`);
					resolve(this.candidates);
				}
			};

			this.peerConnection.onicegatheringstatechange = checkComplete;

			// 즉시 한 번 체크
			checkComplete();
		});
	}

	// ICE candidates를 JSON으로 변환
	getCandidatesAsInit(): RTCIceCandidateInit[] {
		return this.candidates.map((candidate) => ({
			candidate: candidate.candidate,
			sdpMLineIndex: candidate.sdpMLineIndex,
			sdpMid: candidate.sdpMid,
			usernameFragment: candidate.usernameFragment
		}));
	}

	// 수집된 candidate 개수 반환
	getCandidateCount(): number {
		return this.candidates.length;
	}
}

// 연결 상태 모니터링 (개선)
export class ConnectionMonitor {
	private reconnectAttempts = 0;
	private maxReconnectAttempts = 3;
	private reconnectDelay = 1000;
	private connectionTimeout: number | null = null;
	private timeoutDuration: number;

	constructor(
		private peerConnection: RTCPeerConnection,
		private onReconnect: () => Promise<void>,
		private onFailure: () => void,
		timeoutDuration: number = 60000 // 기본 60초
	) {
		this.timeoutDuration = timeoutDuration;

		this.peerConnection.onconnectionstatechange = () => {
			this.handleConnectionStateChange();
		};

		// 연결 시간 초과 모니터링
		this.startConnectionTimeout();
	}

	private startConnectionTimeout(): void {
		this.connectionTimeout = setTimeout(() => {
			if (this.peerConnection.connectionState === 'connecting') {
				console.warn(`⚠️ Connection timeout after ${this.timeoutDuration}ms, treating as failed`);
				this.handleConnectionFailure();
			}
		}, this.timeoutDuration);
	}

	private clearConnectionTimeout(): void {
		if (this.connectionTimeout) {
			clearTimeout(this.connectionTimeout);
			this.connectionTimeout = null;
		}
	}

	private handleConnectionStateChange(): void {
		const state = this.peerConnection.connectionState;
		console.log(`WebRTC connection state: ${state}`);

		switch (state) {
			case 'connected':
				this.reconnectAttempts = 0;
				this.clearConnectionTimeout();
				console.log('✅ WebRTC connection established successfully');
				break;

			case 'connecting':
				console.log('🔄 WebRTC connection in progress...');
				break;

			case 'disconnected':
				console.log('⚠️ WebRTC connection disconnected, attempting reconnect...');
				this.attemptReconnect();
				break;

			case 'failed':
				console.log('❌ WebRTC connection failed');
				this.clearConnectionTimeout();
				this.handleConnectionFailure();
				break;

			case 'closed':
				console.log('🔒 WebRTC connection closed');
				this.clearConnectionTimeout();
				break;
		}
	}

	private async attemptReconnect(): Promise<void> {
		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			console.log('Max reconnect attempts reached');
			this.handleConnectionFailure();
			return;
		}

		this.reconnectAttempts++;
		console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

		setTimeout(async () => {
			try {
				await this.onReconnect();
			} catch (error) {
				console.error('Reconnect failed:', error);
				this.attemptReconnect();
			}
		}, this.reconnectDelay * this.reconnectAttempts);
	}

	private handleConnectionFailure(): void {
		this.clearConnectionTimeout();
		this.onFailure();
	}

	// 수동으로 재연결 시도 (사용자 액션)
	async manualReconnect(): Promise<void> {
		this.reconnectAttempts = 0;
		await this.attemptReconnect();
	}
}
