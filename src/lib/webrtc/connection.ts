import type { GameMessage } from '../types.js';
import { ICEManager, ConnectionMonitor } from './signaling.js';

export class WebRTCConnection {
	private peerConnection: RTCPeerConnection;
	private dataChannel: RTCDataChannel | null = null;
	private onMessageCallback: ((message: GameMessage) => void) | null = null;
	private onConnectionStateCallback: ((state: RTCPeerConnectionState) => void) | null = null;
	private iceManager: ICEManager;
	private connectionMonitor: ConnectionMonitor;

	constructor() {
		this.peerConnection = new RTCPeerConnection({
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' },
				{ urls: 'stun:stun2.l.google.com:19302' },
				{ urls: 'stun:stun3.l.google.com:19302' },
				{ urls: 'stun:stun4.l.google.com:19302' }
			]
		});

		this.peerConnection.onconnectionstatechange = () => {
			this.onConnectionStateCallback?.(this.peerConnection.connectionState);
		};

		// ICE candidate 관리자 초기화
		this.iceManager = new ICEManager(this.peerConnection);

		// 연결 모니터 초기화
		this.connectionMonitor = new ConnectionMonitor(
			this.peerConnection,
			() => this.handleReconnect(),
			() => this.handleConnectionFailure()
		);
	}

	// 호스트용: 데이터 채널 생성
	createDataChannel(channelName: string = 'planning-poker'): void {
		this.dataChannel = this.peerConnection.createDataChannel(channelName, {
			ordered: true,
			maxRetransmits: 3
		});

		this.setupDataChannelEvents();
	}

	// 게스트용: 데이터 채널 수신
	setupGuestDataChannel(): void {
		this.peerConnection.ondatachannel = (event) => {
			this.dataChannel = event.channel;
			this.setupDataChannelEvents();
		};
	}

	private setupDataChannelEvents(): void {
		if (!this.dataChannel) return;

		this.dataChannel.onopen = () => {
			console.log('✅ Data channel opened');
		};

		this.dataChannel.onmessage = (event) => {
			try {
				const message: GameMessage = JSON.parse(event.data);
				this.onMessageCallback?.(message);
			} catch (error) {
				console.error('Failed to parse message:', error);
			}
		};

		this.dataChannel.onclose = () => {
			console.log('🔒 Data channel closed');
		};

		this.dataChannel.onerror = (error) => {
			console.error('Data channel error:', error);
		};
	}

	// 메시지 전송 (재시도 로직 추가)
	sendMessage(message: GameMessage): boolean {
		if (this.dataChannel && this.dataChannel.readyState === 'open') {
			try {
				this.dataChannel.send(JSON.stringify(message));
				return true;
			} catch (error) {
				console.error('Failed to send message:', error);
				return false;
			}
		}
		console.warn('Data channel not ready, message not sent');
		return false;
	}

	// Offer 생성 (호스트용) - ICE candidates 포함
	async createOfferWithCandidates(): Promise<{
		offer: RTCSessionDescriptionInit;
		iceCandidates: RTCIceCandidateInit[];
	}> {
		const offer = await this.peerConnection.createOffer({
			offerToReceiveAudio: false,
			offerToReceiveVideo: false
		});

		await this.peerConnection.setLocalDescription(offer);
		console.log('📡 Offer created, collecting ICE candidates...');

		// ICE candidate 수집 대기
		const candidates = await this.iceManager.waitForCandidates();
		const iceCandidates = this.iceManager.getCandidatesAsInit();

		console.log(`✅ Collected ${candidates.length} ICE candidates`);

		return {
			offer,
			iceCandidates
		};
	}

	// Answer 생성 (게스트용) - ICE candidates 포함
	async createAnswerWithCandidates(
		offer: RTCSessionDescriptionInit,
		iceCandidates: RTCIceCandidateInit[]
	): Promise<{
		answer: RTCSessionDescriptionInit;
		iceCandidates: RTCIceCandidateInit[];
	}> {
		await this.peerConnection.setRemoteDescription(offer);
		console.log('📥 Remote description set');

		// 호스트의 ICE candidates 추가
		for (const candidate of iceCandidates) {
			try {
				await this.peerConnection.addIceCandidate(candidate);
			} catch (error) {
				console.warn('Failed to add ICE candidate:', error);
			}
		}
		console.log(`📡 Added ${iceCandidates.length} remote ICE candidates`);

		const answer = await this.peerConnection.createAnswer();
		await this.peerConnection.setLocalDescription(answer);
		console.log('📤 Answer created, collecting ICE candidates...');

		// ICE candidate 수집 대기
		const candidates = await this.iceManager.waitForCandidates();
		const answerIceCandidates = this.iceManager.getCandidatesAsInit();

		console.log(`✅ Collected ${candidates.length} ICE candidates for answer`);

		return {
			answer,
			iceCandidates: answerIceCandidates
		};
	}

	// Answer 처리 (호스트용) - ICE candidates 포함
	async handleAnswerWithCandidates(
		answer: RTCSessionDescriptionInit,
		iceCandidates: RTCIceCandidateInit[]
	): Promise<void> {
		await this.peerConnection.setRemoteDescription(answer);
		console.log('📥 Remote answer set');

		// 게스트의 ICE candidates 추가
		for (const candidate of iceCandidates) {
			try {
				await this.peerConnection.addIceCandidate(candidate);
			} catch (error) {
				console.warn('Failed to add ICE candidate:', error);
			}
		}
		console.log(`📡 Added ${iceCandidates.length} remote ICE candidates from answer`);
	}

	// 기존 호환성을 위한 메서드들
	async createOffer(): Promise<RTCSessionDescriptionInit> {
		const result = await this.createOfferWithCandidates();
		return result.offer;
	}

	async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
		const result = await this.createAnswerWithCandidates(offer, []);
		return result.answer;
	}

	async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
		await this.handleAnswerWithCandidates(answer, []);
	}

	// ICE candidate 처리 (개별)
	async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
		try {
			await this.peerConnection.addIceCandidate(candidate);
		} catch (error) {
			console.warn('Failed to add ICE candidate:', error);
		}
	}

	// 이벤트 리스너 설정
	onMessage(callback: (message: GameMessage) => void): void {
		this.onMessageCallback = callback;
	}

	onConnectionStateChange(callback: (state: RTCPeerConnectionState) => void): void {
		this.onConnectionStateCallback = callback;
	}

	// ICE candidate 이벤트 설정
	onIceCandidate(callback: (candidate: RTCIceCandidate | null) => void): void {
		this.peerConnection.onicecandidate = (event) => {
			callback(event.candidate);
		};
	}

	// 연결 종료
	close(): void {
		this.dataChannel?.close();
		this.peerConnection.close();
	}

	// 연결 상태 확인
	get connectionState(): RTCPeerConnectionState {
		return this.peerConnection.connectionState;
	}

	get isConnected(): boolean {
		return this.peerConnection.connectionState === 'connected';
	}

	// 재연결 처리
	private async handleReconnect(): Promise<void> {
		console.log('🔄 Attempting to reconnect...');
		// 재연결 로직은 상위 레벨에서 처리
	}

	// 연결 실패 처리
	private handleConnectionFailure(): void {
		console.log('❌ Connection failed permanently');
		this.onConnectionStateCallback?.('failed');
	}

	// ICE candidate 리스너 설정
	onICECandidate(callback: (candidate: RTCIceCandidate) => void): void {
		this.iceManager.onCandidate(callback);
	}

	// 데이터 채널 상태 확인
	get dataChannelState(): RTCDataChannelState | null {
		return this.dataChannel?.readyState || null;
	}

	// 연결 통계 정보
	async getConnectionStats(): Promise<RTCStatsReport | null> {
		try {
			return await this.peerConnection.getStats();
		} catch (error) {
			console.error('Failed to get connection stats:', error);
			return null;
		}
	}

	// 연결 진단 정보
	getConnectionInfo(): {
		connectionState: RTCPeerConnectionState;
		iceConnectionState: RTCIceConnectionState;
		iceGatheringState: RTCIceGatheringState;
		dataChannelState: RTCDataChannelState | null;
		candidateCount: number;
	} {
		return {
			connectionState: this.peerConnection.connectionState,
			iceConnectionState: this.peerConnection.iceConnectionState,
			iceGatheringState: this.peerConnection.iceGatheringState,
			dataChannelState: this.dataChannelState,
			candidateCount: this.iceManager.getCandidateCount()
		};
	}
}
