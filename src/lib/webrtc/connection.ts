import type { GameMessage } from '../types.js';

export class WebRTCConnection {
	private peerConnection: RTCPeerConnection;
	private dataChannel: RTCDataChannel | null = null;
	private onMessageCallback: ((message: GameMessage) => void) | null = null;
	private onConnectionStateCallback: ((state: RTCPeerConnectionState) => void) | null = null;

	constructor() {
		this.peerConnection = new RTCPeerConnection({
			iceServers: [
				{ urls: 'stun:stun.l.google.com:19302' },
				{ urls: 'stun:stun1.l.google.com:19302' }
			]
		});

		this.peerConnection.onconnectionstatechange = () => {
			this.onConnectionStateCallback?.(this.peerConnection.connectionState);
		};
	}

	// 호스트용: 데이터 채널 생성
	createDataChannel(channelName: string = 'planning-poker'): void {
		this.dataChannel = this.peerConnection.createDataChannel(channelName, {
			ordered: true
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
			console.log('Data channel opened');
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
			console.log('Data channel closed');
		};
	}

	// 메시지 전송
	sendMessage(message: GameMessage): void {
		if (this.dataChannel && this.dataChannel.readyState === 'open') {
			this.dataChannel.send(JSON.stringify(message));
		}
	}

	// Offer 생성 (호스트용)
	async createOffer(): Promise<RTCSessionDescriptionInit> {
		const offer = await this.peerConnection.createOffer();
		await this.peerConnection.setLocalDescription(offer);
		return offer;
	}

	// Answer 생성 (게스트용)
	async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
		await this.peerConnection.setRemoteDescription(offer);
		const answer = await this.peerConnection.createAnswer();
		await this.peerConnection.setLocalDescription(answer);
		return answer;
	}

	// Answer 처리 (호스트용)
	async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
		await this.peerConnection.setRemoteDescription(answer);
	}

	// ICE candidate 처리
	async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
		await this.peerConnection.addIceCandidate(candidate);
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
}
