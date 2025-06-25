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
		console.log('🔧 Creating new WebRTC connection...');
		this.peerConnection = new RTCPeerConnection({
			iceServers: [
				// Google STUN 서버들 (더 안정적인 것들만 사용)
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' },
				{ urls: 'stun:stun2.l.google.com:19302' },
				{ urls: 'stun:stun3.l.google.com:19302' },
				{ urls: 'stun:stun4.l.google.com:19302' },
				// 추가 STUN 서버
				{ urls: 'stun:stun.stunprotocol.org:3478' },
				{ urls: 'stun:stun.voiparound.com:3478' }
			],
			iceCandidatePoolSize: 10, // 증가
			bundlePolicy: 'balanced',
			rtcpMuxPolicy: 'require',
			iceTransportPolicy: 'all'
		});

		this.peerConnection.onconnectionstatechange = () => {
			console.log(`🔗 Connection state changed: ${this.peerConnection.connectionState}`);
			this.onConnectionStateCallback?.(this.peerConnection.connectionState);
		};

		this.peerConnection.oniceconnectionstatechange = () => {
			console.log(`🧊 ICE connection state: ${this.peerConnection.iceConnectionState}`);
		};

		this.peerConnection.onicegatheringstatechange = () => {
			console.log(`🧊 ICE gathering state: ${this.peerConnection.iceGatheringState}`);
		};

		this.peerConnection.onicecandidateerror = (event) => {
			console.error('🧊 ICE candidate error:', event);
		};

		// ICE candidate 관리자 초기화
		this.iceManager = new ICEManager(this.peerConnection);

		// 연결 모니터 초기화 (타임아웃 시간 증가)
		this.connectionMonitor = new ConnectionMonitor(
			this.peerConnection,
			() => this.handleReconnect(),
			() => this.handleConnectionFailure(),
			90000 // 90초 타임아웃
		);

		console.log('✅ WebRTC connection created successfully');
	}

	// 호스트용: 데이터 채널 생성
	createDataChannel(channelName: string = 'planning-poker'): void {
		console.log('📡 Creating data channel:', channelName);
		this.dataChannel = this.peerConnection.createDataChannel(channelName, {
			ordered: true,
			maxRetransmits: 3
		});

		this.setupDataChannelEvents();
		console.log('✅ Data channel created');
	}

	// 게스트용: 데이터 채널 수신
	setupGuestDataChannel(): void {
		console.log('📡 Setting up guest data channel listener...');
		this.peerConnection.ondatachannel = (event) => {
			console.log('📡 Data channel received:', event.channel.label);
			this.dataChannel = event.channel;
			this.setupDataChannelEvents();
		};
	}

	private setupDataChannelEvents(): void {
		if (!this.dataChannel) return;

		console.log('🔧 Setting up data channel events...');
		console.log(`📡 Initial data channel state: ${this.dataChannel.readyState}`);

		this.dataChannel.onopen = () => {
			console.log('✅ Data channel opened');
		};

		this.dataChannel.onmessage = (event) => {
			console.log('📨 Data channel message received:', event.data.length, 'bytes');
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

		// 데이터 채널 상태 변화 추적
		const checkDataChannelState = () => {
			console.log(`📡 Data channel state: ${this.dataChannel?.readyState}`);
		};

		// 초기 상태 확인
		checkDataChannelState();

		// 주기적으로 상태 확인 (5초 동안)
		const interval = setInterval(() => {
			checkDataChannelState();
		}, 1000);

		setTimeout(() => {
			clearInterval(interval);
		}, 5000);

		console.log('✅ Data channel events set up');
	}

	// 메시지 전송 (재시도 로직 추가)
	sendMessage(message: GameMessage): boolean {
		if (this.dataChannel && this.dataChannel.readyState === 'open') {
			try {
				const messageStr = JSON.stringify(message);
				console.log(`📤 Sending message: ${message.type} (${messageStr.length} bytes)`);
				this.dataChannel.send(messageStr);
				return true;
			} catch (error) {
				console.error('Failed to send message:', error);
				return false;
			}
		}
		console.warn(
			`❌ Data channel not ready (state: ${this.dataChannel?.readyState}), message not sent: ${message.type}`
		);
		return false;
	}

	// Offer 생성 (호스트용) - ICE candidates 포함
	async createOfferWithCandidates(): Promise<{
		offer: RTCSessionDescriptionInit;
		iceCandidates: RTCIceCandidateInit[];
	}> {
		console.log('📡 Creating offer...');
		const offer = await this.peerConnection.createOffer({
			offerToReceiveAudio: false,
			offerToReceiveVideo: false
		});

		console.log('📡 Setting local description...');
		await this.peerConnection.setLocalDescription(offer);
		console.log('📡 Local description set, collecting ICE candidates...');

		// ICE candidate 수집 대기 (시간 증가)
		const candidates = await this.iceManager.waitForCandidates(15000); // 15초
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
		try {
			console.log('📥 Setting remote description...');
			await this.peerConnection.setRemoteDescription(offer);
			console.log('📥 Remote description set successfully');

			// 호스트의 ICE candidates 추가
			console.log(`📡 Adding ${iceCandidates.length} remote ICE candidates...`);
			for (const candidate of iceCandidates) {
				try {
					await this.peerConnection.addIceCandidate(candidate);
				} catch (error) {
					console.warn('Failed to add ICE candidate:', error);
				}
			}
			console.log(`📡 Added ${iceCandidates.length} remote ICE candidates`);

			console.log('📤 Creating answer...');
			const answer = await this.peerConnection.createAnswer();
			console.log('📤 Answer created, setting local description...');
			await this.peerConnection.setLocalDescription(answer);
			console.log('📤 Local description set, collecting ICE candidates...');

			// ICE candidate 수집 대기 (시간 증가)
			const candidates = await this.iceManager.waitForCandidates(15000); // 15초
			const answerIceCandidates = this.iceManager.getCandidatesAsInit();

			console.log(`✅ Collected ${candidates.length} ICE candidates for answer`);

			return {
				answer,
				iceCandidates: answerIceCandidates
			};
		} catch (error) {
			console.error('❌ Error in createAnswerWithCandidates:', error);
			throw error;
		}
	}

	// Answer 처리 (호스트용) - ICE candidates 포함
	async handleAnswerWithCandidates(
		answer: RTCSessionDescriptionInit,
		iceCandidates: RTCIceCandidateInit[]
	): Promise<void> {
		console.log(`🔍 Current connection state: ${this.peerConnection.connectionState}`);
		console.log(`🔍 Current signaling state: ${this.peerConnection.signalingState}`);

		// 이미 연결된 상태라면 Answer 설정하지 않음
		if (this.peerConnection.connectionState === 'connected') {
			console.log('⚠️ Already connected, skipping answer setup');
			return;
		}

		// 시그널링 상태 확인 - have-local-offer 상태에서만 Answer 설정 가능
		if (this.peerConnection.signalingState !== 'have-local-offer') {
			console.log(
				`⚠️ Signaling state is ${this.peerConnection.signalingState}, cannot set remote description`
			);
			console.log('⚠️ Expected state: have-local-offer');
			return;
		}

		try {
			console.log('📥 Setting remote answer...');
			await this.peerConnection.setRemoteDescription(answer);
			console.log('📥 Remote answer set successfully');

			// 게스트의 ICE candidates 추가
			console.log(`📡 Adding ${iceCandidates.length} remote ICE candidates from answer...`);
			for (const candidate of iceCandidates) {
				try {
					await this.peerConnection.addIceCandidate(candidate);
				} catch (error) {
					console.warn('Failed to add ICE candidate:', error);
				}
			}
			console.log(`📡 Added ${iceCandidates.length} remote ICE candidates from answer`);
		} catch (error) {
			console.error('❌ Error setting remote answer:', error);
			throw error;
		}
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
		const connectionState = this.peerConnection.connectionState;
		const iceConnectionState = this.peerConnection.iceConnectionState;
		const dataChannelState = this.dataChannel?.readyState;

		console.log(
			`🔍 Connection check - Connection: ${connectionState}, ICE: ${iceConnectionState}, DataChannel: ${dataChannelState}`
		);

		// ICE connection이 connected이고 데이터 채널이 connecting 이상이면 연결된 것으로 간주
		return (
			(connectionState === 'connected' || iceConnectionState === 'connected') &&
			(dataChannelState === 'open' ||
				dataChannelState === 'connecting' ||
				dataChannelState === undefined)
		);
	}

	// ICE connection state 확인
	get iceConnectionState(): RTCIceConnectionState {
		return this.peerConnection.iceConnectionState;
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
