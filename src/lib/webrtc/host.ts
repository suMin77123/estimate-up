import { WebRTCConnection } from './connection.js';
import type { GameMessage, User, Room } from '../types.js';
import { generateUserId, generateCardDeck, calculateStats } from '../stores/game.js';
import { SignalingManager, type ConnectionData, type AnswerData } from './signaling.js';

export class PlanningPokerHost {
	private connections: Map<string, WebRTCConnection> = new Map();
	private participants: Map<string, User> = new Map();
	private room: Room;
	private onRoomUpdateCallback: ((room: Room) => void) | null = null;

	constructor(roomId: string, hostName: string) {
		const hostId = generateUserId();
		this.room = {
			id: roomId,
			hostId,
			participants: new Map(),
			gameState: 'waiting',
			cards: generateCardDeck(),
			currentRound: 1
		};

		// 호스트를 참가자로 추가
		const host: User = {
			id: hostId,
			name: hostName,
			isHost: true,
			connected: true
		};

		this.participants.set(hostId, host);
		this.room.participants = this.participants;

		console.log(`🏠 Host created: ${hostName} (${hostId})`);
	}

	// 참가 링크 생성 (개선된 ICE candidates 포함)
	async generateJoinLink(baseUrl: string): Promise<string> {
		try {
			// 임시 연결로 Offer 및 ICE candidates 생성
			const tempConnection = new WebRTCConnection();
			tempConnection.createDataChannel();

			const { offer, iceCandidates } = await tempConnection.createOfferWithCandidates();

			const connectionData: ConnectionData = {
				offer,
				iceCandidates,
				roomId: this.room.id,
				hostName: this.participants.get(this.room.hostId!)?.name || 'Host',
				timestamp: Date.now()
			};

			const encodedOffer = SignalingManager.encodeOffer(connectionData);
			const joinLink = SignalingManager.createJoinLink(baseUrl, this.room.id, encodedOffer);

			// 임시 연결 정리
			tempConnection.close();

			console.log(`📋 Join link generated with ${iceCandidates.length} ICE candidates`);
			return joinLink;
		} catch (error) {
			console.error('Failed to generate join link:', error);
			throw new Error('참가 링크 생성에 실패했습니다');
		}
	}

	// 새 참가자 연결 처리 (개선된 Answer 처리)
	async handleNewParticipant(answerCode: string): Promise<void> {
		try {
			console.log('🔄 Processing new participant...');

			// Answer 코드 검증
			if (!SignalingManager.validateAnswerCode(answerCode)) {
				throw new Error('유효하지 않은 참가 코드입니다');
			}

			const answerData: AnswerData = SignalingManager.decodeAnswer(answerCode);
			const participantId = answerData.participantId;

			console.log(`👤 Adding participant: ${answerData.participantName} (${participantId})`);

			// 이미 연결된 참가자인지 확인
			if (this.connections.has(participantId)) {
				const existingConnection = this.connections.get(participantId)!;

				// 연결이 이미 완료된 상태라면 새로 연결하지 않음
				if (existingConnection.isConnected) {
					console.log('⚠️ Participant already connected, skipping new connection');
					return;
				}

				// 연결 중이거나 실패한 상태라면 기존 연결 정리
				console.log('⚠️ Participant connection exists but not connected, cleaning up');
				existingConnection.close();
			}

			// 새 WebRTC 연결 생성
			console.log('🔧 Creating new WebRTC connection for participant...');
			const connection = new WebRTCConnection();
			connection.createDataChannel();

			// 메시지 핸들러 설정
			connection.onMessage((message) => {
				console.log(`📨 Host received message from ${participantId}:`, message.type);
				this.handleMessage(participantId, message);
			});

			// 연결 상태 변화 처리
			connection.onConnectionStateChange((state) => {
				console.log(`🔗 Participant ${answerData.participantName} connection state: ${state}`);
				this.handleConnectionStateChange(participantId, state);
			});

			// 참가자 정보 저장 (연결 시도 전에 미리 저장)
			const participant: User = {
				id: participantId,
				name: answerData.participantName,
				isHost: false,
				connected: false // 연결 완료 시 true로 변경됨
			};

			this.participants.set(participantId, participant);
			this.connections.set(participantId, connection);
			this.room.participants = this.participants;

			// 새로운 Offer 생성 (이 참가자 전용)
			console.log('📡 Creating new offer for participant...');
			const { iceCandidates } = await connection.createOfferWithCandidates();
			console.log(`📡 Offer created with ${iceCandidates.length} ICE candidates`);

			// Offer는 이미 setLocalDescription으로 설정됨 (createOfferWithCandidates에서)
			console.log('📡 Local offer set for participant');

			// Answer 및 ICE candidates 처리
			console.log('📥 Processing answer from participant...');
			await connection.handleAnswerWithCandidates(answerData.answer, answerData.iceCandidates);

			// 연결 완료 대기 (최대 45초, 더 긴 간격으로 체크)
			console.log('⏳ Waiting for connection to establish...');
			let connectionEstablished = false;
			for (let i = 0; i < 90; i++) {
				// 90회 * 500ms = 45초
				// 연결 상태와 ICE connection 상태 모두 확인
				const isConnected = connection.isConnected;
				const iceConnected = connection.iceConnectionState === 'connected';
				const dataChannelState = connection.dataChannelState;

				console.log(
					`⏳ Connection check ${i + 1}/90 - Connected: ${isConnected}, ICE: ${iceConnected}, DataChannel: ${dataChannelState}`
				);

				// ICE connection이 connected이고 데이터 채널이 connecting 이상이면 연결된 것으로 간주
				if (
					isConnected ||
					(iceConnected && (dataChannelState === 'open' || dataChannelState === 'connecting'))
				) {
					connectionEstablished = true;
					console.log('✅ Connection established successfully');
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms 대기
			}

			if (!connectionEstablished) {
				console.warn('⚠️ Connection not established within 45 seconds, but continuing...');
				console.warn(
					`⚠️ Final connection state: Connected: ${connection.isConnected}, ICE: ${connection.iceConnectionState}, DataChannel: ${connection.dataChannelState}`
				);

				// 연결 실패 시 정리
				console.warn('🧹 Cleaning up failed connection...');
				connection.close();
				this.connections.delete(participantId);
				this.participants.delete(participantId);
				this.room.participants = this.participants;
				throw new Error('WebRTC 연결 설정에 실패했습니다. 네트워크 환경을 확인해주세요.');
			}

			// 초기 게임 상태 전송 (연결 완료 후)
			this.scheduleInitialGameState(participantId);

			this.broadcastUserJoined(participant);
			this.updateRoom();

			console.log(`✅ Participant ${answerData.participantName} added successfully`);
		} catch (error) {
			console.error('Failed to add participant:', error);
			throw new Error('참가자 추가에 실패했습니다: ' + (error as Error).message);
		}
	}

	// 초기 게임 상태 전송 (연결 완료 대기)
	private scheduleInitialGameState(participantId: string): void {
		const connection = this.connections.get(participantId);
		if (!connection) return;

		const sendInitialState = () => {
			if (connection.isConnected) {
				this.sendInitialGameState(participantId);
			} else {
				// 연결이 아직 안되었으면 100ms 후 재시도
				setTimeout(sendInitialState, 100);
			}
		};

		// 즉시 한 번 시도, 안되면 재시도
		sendInitialState();
	}

	// 초기 게임 상태 전송
	private sendInitialGameState(participantId: string): void {
		const connection = this.connections.get(participantId);
		if (!connection || !connection.isConnected) {
			console.warn(`❌ Cannot send initial state to ${participantId}: connection not ready`);
			return;
		}

		const participant = this.participants.get(participantId);
		if (!participant) {
			console.warn(`❌ Participant ${participantId} not found`);
			return;
		}

		const initialMessage: GameMessage = {
			type: 'game_state_changed',
			data: {
				gameState: this.room.gameState,
				participants: Array.from(this.participants.values()),
				currentRound: this.room.currentRound,
				cards: this.room.cards,
				results: this.room.results
			},
			timestamp: Date.now(),
			senderId: this.room.hostId!
		};

		console.log(`📤 Sending initial game state to ${participant.name}...`);
		const sent = connection.sendMessage(initialMessage);
		if (sent) {
			console.log(`✅ Initial game state sent to ${participant.name}`);
		} else {
			console.warn(`❌ Failed to send initial game state to ${participant.name}`);
		}
	}

	// 사용자 참가 알림 브로드캐스트
	private broadcastUserJoined(participant: User): void {
		const message: GameMessage = {
			type: 'user_joined',
			data: {
				user: participant
			},
			timestamp: Date.now(),
			senderId: this.room.hostId!
		};

		this.broadcastToAll(message);
	}

	// 메시지 처리
	private handleMessage(senderId: string, message: GameMessage): void {
		console.log(`📨 Message from ${senderId}:`, message.type);

		switch (message.type) {
			case 'card_selected':
				this.handleCardSelection(senderId, message.data.card as string);
				break;
			case 'emoji_sent':
				this.broadcastToAll(message, senderId);
				break;
		}
	}

	// 카드 선택 처리
	private handleCardSelection(participantId: string, card: string): void {
		const participant = this.participants.get(participantId);
		if (participant && this.room.gameState === 'voting') {
			participant.selectedCard = card;
			this.participants.set(participantId, participant);
			this.room.participants = this.participants;

			console.log(`🎴 ${participant.name} selected card: ${card}`);

			// 모든 참가자에게 업데이트 브로드캐스트
			this.broadcastGameState();
			this.updateRoom();

			// 모든 카드가 선택되었는지 확인
			if (this.areAllCardsSelected()) {
				console.log('✅ All cards selected, ready to reveal');
			}
		}
	}

	// 연결 상태 변화 처리
	private handleConnectionStateChange(participantId: string, state: RTCPeerConnectionState): void {
		const participant = this.participants.get(participantId);
		const connection = this.connections.get(participantId);

		if (participant && connection) {
			const wasConnected = participant.connected;
			const iceConnected = connection.iceConnectionState === 'connected';
			const dataChannelState = connection.dataChannelState;

			// ICE connection이 connected이고 데이터 채널이 connecting 이상이면 연결된 것으로 간주
			participant.connected =
				state === 'connected' ||
				(iceConnected && (dataChannelState === 'open' || dataChannelState === 'connecting'));
			this.participants.set(participantId, participant);
			this.room.participants = this.participants;

			console.log(
				`🔗 ${participant.name} connection state: ${state}, ICE: ${connection.iceConnectionState}, DataChannel: ${connection.dataChannelState}`
			);

			if (!wasConnected && participant.connected) {
				console.log(`✅ ${participant.name} connected successfully`);
			} else if (wasConnected && !participant.connected) {
				console.log(`⚠️ ${participant.name} disconnected`);
			}

			this.updateRoom();
		}

		// 연결 실패 시 더 오래 기다림 (15초)
		if (state === 'failed') {
			console.log(
				`❌ Connection failed for participant ${participantId}, will remove in 15 seconds`
			);
			setTimeout(() => this.removeParticipant(participantId), 15000);
		} else if (state === 'disconnected') {
			console.log(`⚠️ Participant ${participantId} disconnected, will remove in 10 seconds`);
			setTimeout(() => this.removeParticipant(participantId), 10000);
		}
	}

	// 참가자 제거
	private removeParticipant(participantId: string): void {
		const participant = this.participants.get(participantId);
		if (participant) {
			console.log(`👋 Removing participant: ${participant.name}`);

			this.participants.delete(participantId);
			this.connections.get(participantId)?.close();
			this.connections.delete(participantId);
			this.room.participants = this.participants;

			// 참가자 퇴장 알림
			const message: GameMessage = {
				type: 'user_left',
				data: {
					user: participant
				},
				timestamp: Date.now(),
				senderId: this.room.hostId!
			};

			this.broadcastToAll(message);
			this.broadcastGameState();
			this.updateRoom();
		}
	}

	// 게임 상태 변경
	changeGameState(newState: 'waiting' | 'voting' | 'revealed'): void {
		console.log(`🎮 Changing game state: ${this.room.gameState} → ${newState}`);

		this.room.gameState = newState;

		if (newState === 'voting') {
			// 투표 시작 시 모든 카드 선택 초기화
			for (const [id, participant] of this.participants) {
				if (!participant.isHost) {
					participant.selectedCard = undefined;
					this.participants.set(id, participant);
				}
			}
			this.room.participants = this.participants;
		} else if (newState === 'revealed') {
			// 결과 계산
			this.calculateResults();
		}

		this.broadcastGameState();
		this.updateRoom();
	}

	// 결과 계산
	private calculateResults(): void {
		const votes: Record<string, string> = {};

		for (const [id, participant] of this.participants) {
			if (!participant.isHost && participant.selectedCard) {
				votes[id] = participant.selectedCard;
			}
		}

		const stats = calculateStats(votes);
		this.room.results = {
			average: parseFloat(stats.average),
			total: parseFloat(stats.total),
			votes: Object.values(votes)
		};

		console.log('📊 Results calculated:', this.room.results);
	}

	// 다음 라운드
	nextRound(): void {
		console.log(`🔄 Starting round ${this.room.currentRound! + 1}`);

		this.room.currentRound = (this.room.currentRound || 1) + 1;
		this.room.gameState = 'waiting';
		this.room.results = null;

		// 모든 카드 선택 초기화
		for (const [id, participant] of this.participants) {
			if (!participant.isHost) {
				participant.selectedCard = undefined;
				this.participants.set(id, participant);
			}
		}
		this.room.participants = this.participants;

		// 새 카드 덱 생성
		this.room.cards = generateCardDeck();

		this.broadcastGameState();
		this.updateRoom();
	}

	// 모든 참가자에게 메시지 브로드캐스트
	private broadcastToAll(message: GameMessage, excludeId?: string): void {
		let sentCount = 0;
		let totalCount = 0;

		for (const [id, connection] of this.connections) {
			if (id !== excludeId && connection.isConnected) {
				totalCount++;
				if (connection.sendMessage(message)) {
					sentCount++;
				}
			}
		}

		console.log(`📡 Broadcasted ${message.type} to ${sentCount}/${totalCount} participants`);
	}

	// 게임 상태 브로드캐스트
	private broadcastGameState(): void {
		const message: GameMessage = {
			type: 'game_state_changed',
			data: {
				gameState: this.room.gameState,
				participants: Array.from(this.participants.values()),
				currentRound: this.room.currentRound,
				cards: this.room.cards,
				results: this.room.results
			},
			timestamp: Date.now(),
			senderId: this.room.hostId!
		};

		this.broadcastToAll(message);
	}

	// 방 업데이트 콜백 호출
	private updateRoom(): void {
		this.onRoomUpdateCallback?.(this.room);
	}

	// 방 업데이트 리스너 설정
	onRoomUpdate(callback: (room: Room) => void): void {
		this.onRoomUpdateCallback = callback;
	}

	// 현재 방 정보 반환
	getRoom(): Room {
		return this.room;
	}

	// 참가자 수 반환
	getParticipantCount(): number {
		return this.participants.size;
	}

	// 모든 카드가 선택되었는지 확인
	areAllCardsSelected(): boolean {
		const nonHostParticipants = Array.from(this.participants.values()).filter(
			(p) => !p.isHost && p.connected
		);
		return nonHostParticipants.length > 0 && nonHostParticipants.every((p) => p.selectedCard);
	}

	// 연결된 참가자 수 반환
	getConnectedParticipantCount(): number {
		return Array.from(this.participants.values()).filter((p) => p.connected).length;
	}

	// 호스트 정리
	cleanup(): void {
		console.log('🧹 Cleaning up host connections');

		for (const connection of this.connections.values()) {
			connection.close();
		}
		this.connections.clear();
	}

	async processGuestAnswer(guestId: string, answerCode: string): Promise<boolean> {
		try {
			console.log(`🔄 Processing answer from guest ${guestId}`);
			console.log(`📋 Answer code length: ${answerCode.length}`);

			const connectionData = JSON.parse(atob(answerCode));
			console.log(`📋 Parsed connection data:`, connectionData);

			const answer = connectionData.answer;
			const iceCandidates = connectionData.iceCandidates || [];

			console.log(`📋 Answer SDP length: ${answer.sdp.length}`);
			console.log(`📋 ICE candidates count: ${iceCandidates.length}`);

			// 기존 연결이 있는지 확인
			const existingConnection = this.connections.get(guestId);
			if (existingConnection) {
				console.log(`⚠️ Connection already exists for guest ${guestId}, removing old connection`);
				existingConnection.close();
				this.connections.delete(guestId);
			}

			// 새 연결 생성
			const connection = new WebRTCConnection();
			console.log(`🔗 Creating new connection for guest ${guestId}`);

			// 데이터 채널 생성
			connection.createDataChannel();
			console.log(`📡 Data channel created for guest ${guestId}`);

			// 연결 상태 변화 추적
			connection.onConnectionStateChange((isConnected) => {
				console.log(
					`🔗 Host connection state for guest ${guestId}: ${connection.connectionState} (connected: ${isConnected})`
				);
				console.log(`🧊 ICE connection state: ${connection.iceConnectionState}`);
				console.log(`📡 Data channel state: ${connection.dataChannelState}`);

				if (isConnected) {
					console.log(`✅ Guest ${guestId} successfully connected to host`);
				}
			});

			// 메시지 수신 처리
			connection.onMessage((message) => {
				console.log(`📨 Host received message from guest ${guestId}:`, message);
				this.handleMessage(guestId, message);
			});

			// Answer 설정 (게스트가 이미 생성한 Answer 사용)
			console.log(`🔧 Setting remote description for guest ${guestId}`);
			await connection.handleAnswerWithCandidates(answer, iceCandidates);

			// 연결 저장
			this.connections.set(guestId, connection);
			console.log(`💾 Connection saved for guest ${guestId}`);

			// 참가자 정보 저장
			const participantName = connectionData.participantName || 'Unknown';
			const participant: User = {
				id: guestId,
				name: participantName,
				isHost: false,
				connected: false
			};
			this.participants.set(guestId, participant);
			this.room.participants = this.participants;

			// 연결 완료 대기
			console.log(`⏳ Waiting for connection to complete for guest ${guestId}...`);
			let connected = false;
			for (let i = 0; i < 60; i++) {
				const isConnected = connection.isConnected;
				const iceConnected = connection.iceConnectionState === 'connected';
				const dataChannelState = connection.dataChannelState;

				console.log(
					`⏳ Connection check ${i + 1}/60 - Connected: ${isConnected}, ICE: ${iceConnected}, DataChannel: ${dataChannelState}`
				);

				if (
					isConnected ||
					(iceConnected && (dataChannelState === 'open' || dataChannelState === 'connecting'))
				) {
					connected = true;
					console.log(`✅ Connection established for guest ${guestId}`);
					break;
				}
				await new Promise((resolve) => setTimeout(resolve, 500));
			}

			console.log(`🎯 Connection result for guest ${guestId}: ${connected}`);

			if (connected) {
				console.log(`✅ Guest ${guestId} connection established successfully`);
				// 참가자 연결 상태 업데이트
				participant.connected = true;
				this.participants.set(guestId, participant);
				this.room.participants = this.participants;

				// 초기 게임 상태 전송
				this.sendInitialGameState(guestId);

				// 참가자 참가 알림 브로드캐스트
				this.broadcastUserJoined(participant);
				this.updateRoom();
			} else {
				console.log(`❌ Failed to establish connection with guest ${guestId}`);
				// 실패한 연결 정리
				connection.close();
				this.connections.delete(guestId);
				this.participants.delete(guestId);
				this.room.participants = this.participants;
			}

			return connected;
		} catch (error) {
			console.error(`❌ Error processing answer from guest ${guestId}:`, error);
			return false;
		}
	}
}
