import { WebRTCConnection } from './connection.js';
import type { GameMessage, User, Room } from '../types.js';
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

		// 게스트용 데이터 채널 설정
		this.connection.setupGuestDataChannel();

		// 메시지 핸들러 설정
		this.connection.onMessage((message) => {
			this.handleMessage(message);
		});

		// 연결 상태 변화 처리
		this.connection.onConnectionStateChange((state) => {
			this.onConnectionStateCallback?.(state === 'connected');
		});
	}

	// 방 참가 (링크에서 Offer 추출하여 Answer 생성)
	async joinRoomFromLink(joinCode: string): Promise<string> {
		try {
			// 링크에서 연결 데이터 추출
			const connectionData: ConnectionData = SignalingManager.decodeOffer(joinCode);

			// 연결 데이터 검증
			if (Date.now() - connectionData.timestamp > 300000) {
				// 5분 만료
				throw new Error('링크가 만료되었습니다');
			}

			// Offer로 Answer 생성
			const answer = await this.connection.createAnswer(connectionData.offer);

			// Answer 데이터 구성
			const answerData: AnswerData = {
				answer,
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

			return answerCode;
		} catch (error) {
			console.error('Failed to join room:', error);
			throw new Error('방 참가에 실패했습니다: ' + (error as Error).message);
		}
	}

	// 메시지 처리
	private handleMessage(message: GameMessage): void {
		switch (message.type) {
			case 'game_state_changed':
				this.handleGameStateChange(message);
				break;
			case 'emoji_sent':
				this.handleEmojiMessage(message);
				break;
			case 'user_joined':
				// 새 사용자 참가 알림
				break;
			case 'user_left':
				// 사용자 퇴장 알림
				break;
		}
	}

	// 게임 상태 변화 처리
	private handleGameStateChange(message: GameMessage): void {
		if (this.room) {
			this.room.gameState = message.data.gameState as 'waiting' | 'voting' | 'revealed';
			this.room.currentRound = message.data.currentRound as number;

			// 참가자 목록 업데이트
			const participants = message.data.participants as User[];
			this.room.participants = new Map(participants.map((p) => [p.id, p]));

			this.updateRoom();
		}
	}

	// 이모티콘 메시지 처리
	private handleEmojiMessage(message: GameMessage): void {
		// 이모티콘 애니메이션 처리
		console.log('Emoji received:', message.data);
	}

	// 카드 선택
	selectCard(card: string): void {
		if (!this.connection.isConnected) {
			console.error('Connection not established');
			return;
		}

		const message: GameMessage = {
			type: 'card_selected',
			data: { card },
			timestamp: Date.now(),
			senderId: this.userId
		};

		this.connection.sendMessage(message);

		// 로컬 상태 업데이트
		if (this.room) {
			const user = this.room.participants.get(this.userId);
			if (user) {
				user.selectedCard = card;
				this.room.participants.set(this.userId, user);
				this.updateRoom();
			}
		}
	}

	// 이모티콘 전송
	sendEmoji(targetUserId: string, emoji: string): void {
		if (!this.connection.isConnected) {
			console.error('Connection not established');
			return;
		}

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
	}

	// 현재 방 정보 반환
	getRoom(): Room | null {
		return this.room;
	}

	// 사용자 ID 반환
	getUserId(): string {
		return this.userId;
	}

	// 사용자 이름 반환
	getUserName(): string {
		return this.userName;
	}

	// 연결 상태 확인
	isConnected(): boolean {
		return this.connection.isConnected;
	}

	// 현재 선택한 카드 반환
	getSelectedCard(): string | undefined {
		if (this.room) {
			const user = this.room.participants.get(this.userId);
			return user?.selectedCard;
		}
		return undefined;
	}

	// 연결 종료
	disconnect(): void {
		this.connection.close();
		this.room = null;
	}
}
