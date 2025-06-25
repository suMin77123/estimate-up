import { WebRTCConnection } from './connection.js';
import type { GameMessage, User, Room, GameResults } from '../types.js';
import { generateUserId } from '../stores/game.js';
import { SignalingManager, type ConnectionData, type AnswerData } from './signaling.js';

export class PlanningPokerGuest {
	private connection: WebRTCConnection;
	private userId: string;
	private userName: string;
	private room: Room | null = null;
	private onRoomUpdateCallback: ((room: Room) => void) | null = null;
	private onConnectionStateCallback: ((connected: boolean) => void) | null = null;

	constructor(userName: string) {
		this.userId = generateUserId();
		this.userName = userName;
		this.connection = new WebRTCConnection();

		console.log(`👤 Guest created: ${userName} (${this.userId})`);

		// 게스트용 데이터 채널 설정
		this.connection.setupGuestDataChannel();

		// 메시지 핸들러 설정
		this.connection.onMessage((message) => {
			this.handleMessage(message);
		});

		// 연결 상태 변화 처리
		this.connection.onConnectionStateChange((state) => {
			const isConnected = state === 'connected';
			console.log(`🔗 Connection state changed: ${state} (connected: ${isConnected})`);
			this.onConnectionStateCallback?.(isConnected);
		});
	}

	// 방 참가 (개선된 ICE candidates 포함)
	async joinRoomFromLink(joinCode: string): Promise<string> {
		try {
			console.log('🔄 Processing join link...');

			// 링크에서 연결 데이터 추출
			const connectionData: ConnectionData = SignalingManager.decodeOffer(joinCode);

			// 연결 데이터 검증
			const linkAge = Date.now() - connectionData.timestamp;
			if (linkAge > 300000) {
				// 5분 만료
				throw new Error('링크가 만료되었습니다 (5분 초과)');
			}

			console.log(`📡 Joining room ${connectionData.roomId} (host: ${connectionData.hostName})`);
			console.log(
				`📡 Link age: ${Math.round(linkAge / 1000)}s, ICE candidates: ${connectionData.iceCandidates.length}`
			);

			// Offer와 ICE candidates로 Answer 생성
			const { answer, iceCandidates } = await this.connection.createAnswerWithCandidates(
				connectionData.offer,
				connectionData.iceCandidates
			);

			// Answer 데이터 구성
			const answerData: AnswerData = {
				answer,
				iceCandidates,
				participantName: this.userName,
				participantId: this.userId
			};

			// 호스트에게 전달할 Answer 코드 생성
			const answerCode = SignalingManager.encodeAnswer(answerData);

			// 방 정보 초기 설정
			this.room = {
				id: connectionData.roomId,
				hostId: 'host', // 실제 호스트 ID는 연결 후 받음
				participants: new Map(),
				gameState: 'waiting',
				cards: [],
				currentRound: 1
			};

			console.log(`✅ Answer code generated (length: ${answerCode.length})`);
			console.log(`📊 Generated answer with ${iceCandidates.length} ICE candidates`);

			return answerCode;
		} catch (error) {
			console.error('Failed to join room:', error);
			throw new Error('방 참가에 실패했습니다: ' + (error as Error).message);
		}
	}

	// 메시지 처리
	private handleMessage(message: GameMessage): void {
		console.log(`📨 Received message: ${message.type}`);

		switch (message.type) {
			case 'game_state_changed':
				this.handleGameStateChange(message);
				break;
			case 'user_joined':
				this.handleUserJoined(message);
				break;
			case 'user_left':
				this.handleUserLeft(message);
				break;
			case 'emoji_sent':
				this.handleEmojiMessage(message);
				break;
		}
	}

	// 게임 상태 변화 처리
	private handleGameStateChange(message: GameMessage): void {
		if (this.room) {
			const oldState = this.room.gameState;
			this.room.gameState = message.data.gameState as 'waiting' | 'voting' | 'revealed';
			this.room.currentRound = message.data.currentRound as number;
			this.room.cards = message.data.cards as string[];
			this.room.results = message.data.results ? (message.data.results as GameResults) : null;

			// 참가자 목록 업데이트
			const participants = message.data.participants as User[];
			this.room.participants = new Map(participants.map((p) => [p.id, p]));

			// 호스트 ID 업데이트
			const host = participants.find((p) => p.isHost);
			if (host) {
				this.room.hostId = host.id;
			}

			console.log(
				`🎮 Game state: ${oldState} → ${this.room.gameState} (round ${this.room.currentRound})`
			);
			console.log(
				`👥 Participants: ${participants.length}, Cards: ${this.room.cards?.length || 0}`
			);

			this.updateRoom();
		}
	}

	// 사용자 참가 처리
	private handleUserJoined(message: GameMessage): void {
		const user = message.data.user as User;
		console.log(`👋 User joined: ${user.name}`);

		if (this.room) {
			this.room.participants.set(user.id, user);
			this.updateRoom();
		}
	}

	// 사용자 퇴장 처리
	private handleUserLeft(message: GameMessage): void {
		const user = message.data.user as User;
		console.log(`👋 User left: ${user.name}`);

		if (this.room) {
			this.room.participants.delete(user.id);
			this.updateRoom();
		}
	}

	// 이모티콘 메시지 처리
	private handleEmojiMessage(message: GameMessage): void {
		console.log('😄 Emoji received:', message.data);
		// UI에서 이모티콘 애니메이션 처리
	}

	// 카드 선택
	selectCard(card: string): void {
		if (!this.connection.isConnected) {
			console.error('❌ Connection not established, cannot select card');
			return;
		}

		if (this.room?.gameState !== 'voting') {
			console.warn('⚠️ Game is not in voting state');
			return;
		}

		console.log(`🎴 Selecting card: ${card}`);

		const message: GameMessage = {
			type: 'card_selected',
			data: { card },
			timestamp: Date.now(),
			senderId: this.userId
		};

		const sent = this.connection.sendMessage(message);
		if (sent) {
			// 로컬 상태 업데이트
			if (this.room) {
				const user = this.room.participants.get(this.userId);
				if (user) {
					user.selectedCard = card;
					this.room.participants.set(this.userId, user);
					this.updateRoom();
				}
			}
			console.log(`✅ Card selected: ${card}`);
		} else {
			console.error(`❌ Failed to send card selection: ${card}`);
		}
	}

	// 이모티콘 전송
	sendEmoji(targetUserId: string, emoji: string): void {
		if (!this.connection.isConnected) {
			console.error('❌ Connection not established, cannot send emoji');
			return;
		}

		console.log(`😄 Sending emoji ${emoji} to ${targetUserId}`);

		const message: GameMessage = {
			type: 'emoji_sent',
			data: {
				from: this.userId,
				to: targetUserId,
				emoji,
				timestamp: Date.now()
			},
			timestamp: Date.now(),
			senderId: this.userId
		};

		this.connection.sendMessage(message);
	}

	// 방 정보 업데이트 콜백 호출
	private updateRoom(): void {
		if (this.room) {
			this.onRoomUpdateCallback?.(this.room);
		}
	}

	// 방 정보 업데이트 리스너 설정
	onRoomUpdate(callback: (room: Room) => void): void {
		this.onRoomUpdateCallback = callback;
	}

	// 연결 상태 변화 리스너 설정
	onConnectionStateChange(callback: (connected: boolean) => void): void {
		this.onConnectionStateCallback = callback;
	}

	// 초기 방 정보 설정 (연결 후 호스트에서 전달받음)
	setInitialRoomData(room: Room): void {
		this.room = { ...room };

		// 자신을 참가자로 추가
		const user: User = {
			id: this.userId,
			name: this.userName,
			isHost: false,
			connected: true
		};

		this.room.participants.set(this.userId, user);
		this.updateRoom();

		console.log(`🏠 Initial room data set for room ${room.id}`);
	}

	// 현재 방 정보 반환
	getRoom(): Room | null {
		return this.room;
	}

	// 내 사용자 ID 반환
	getUserId(): string {
		return this.userId;
	}

	// 내 이름 반환
	getUserName(): string {
		return this.userName;
	}

	// 연결 상태 반환
	isConnected(): boolean {
		return this.connection.isConnected;
	}

	// 선택한 카드 반환
	getSelectedCard(): string | undefined {
		if (!this.room) return undefined;
		const user = this.room.participants.get(this.userId);
		return user?.selectedCard;
	}

	// 연결 종료
	disconnect(): void {
		console.log('👋 Guest disconnecting...');
		this.connection.close();
	}
}
