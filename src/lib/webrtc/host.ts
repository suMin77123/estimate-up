import { WebRTCConnection } from './connection.js';
import type { GameMessage, User, Room } from '../types.js';
import { generateUserId, generateCardDeck } from '../stores/game.js';

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
		this.updateRoom();
	}

	// 새 참가자 연결 처리
	async handleNewParticipant(participantName: string): Promise<string> {
		const participantId = generateUserId();
		const connection = new WebRTCConnection();

		// 데이터 채널 생성
		connection.createDataChannel();

		// 메시지 핸들러 설정
		connection.onMessage((message) => {
			this.handleMessage(participantId, message);
		});

		// 연결 상태 변화 처리
		connection.onConnectionStateChange((state) => {
			this.handleConnectionStateChange(participantId, state);
		});

		// Offer 생성
		const offer = await connection.createOffer();

		// 참가자 정보 저장
		const participant: User = {
			id: participantId,
			name: participantName,
			isHost: false,
			connected: false
		};

		this.participants.set(participantId, participant);
		this.connections.set(participantId, connection);
		this.room.participants = this.participants;
		this.updateRoom();

		// Offer를 base64로 인코딩하여 반환
		return btoa(JSON.stringify(offer));
	}

	// Answer 처리
	async handleAnswer(participantId: string, answerBase64: string): Promise<void> {
		const connection = this.connections.get(participantId);
		if (!connection) {
			throw new Error('Participant not found');
		}

		const answer = JSON.parse(atob(answerBase64));
		await connection.handleAnswer(answer);
	}

	// 메시지 처리
	private handleMessage(senderId: string, message: GameMessage): void {
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
		if (participant) {
			participant.selectedCard = card;
			this.participants.set(participantId, participant);
			this.room.participants = this.participants;

			// 모든 참가자에게 업데이트 브로드캐스트
			this.broadcastGameState();
			this.updateRoom();
		}
	}

	// 연결 상태 변화 처리
	private handleConnectionStateChange(participantId: string, state: RTCPeerConnectionState): void {
		const participant = this.participants.get(participantId);
		if (participant) {
			participant.connected = state === 'connected';
			this.participants.set(participantId, participant);
			this.room.participants = this.participants;
			this.updateRoom();
		}

		if (state === 'disconnected' || state === 'failed') {
			this.removeParticipant(participantId);
		}
	}

	// 참가자 제거
	private removeParticipant(participantId: string): void {
		this.participants.delete(participantId);
		this.connections.get(participantId)?.close();
		this.connections.delete(participantId);
		this.room.participants = this.participants;
		this.broadcastGameState();
		this.updateRoom();
	}

	// 게임 상태 변경
	changeGameState(newState: 'waiting' | 'voting' | 'revealed'): void {
		this.room.gameState = newState;

		if (newState === 'voting') {
			// 모든 참가자의 카드 선택 초기화
			this.participants.forEach((participant) => {
				if (!participant.isHost) {
					participant.selectedCard = undefined;
				}
			});
			this.room.participants = this.participants;
		}

		this.broadcastGameState();
		this.updateRoom();
	}

	// 다음 라운드
	nextRound(): void {
		this.room.currentRound++;
		this.room.gameState = 'waiting';

		// 모든 참가자의 카드 선택 초기화
		this.participants.forEach((participant) => {
			if (!participant.isHost) {
				participant.selectedCard = undefined;
			}
		});
		this.room.participants = this.participants;

		this.broadcastGameState();
		this.updateRoom();
	}

	// 모든 참가자에게 메시지 브로드캐스트
	private broadcastToAll(message: GameMessage, excludeId?: string): void {
		this.connections.forEach((connection, participantId) => {
			if (participantId !== excludeId && connection.isConnected) {
				connection.sendMessage(message);
			}
		});
	}

	// 게임 상태 브로드캐스트
	private broadcastGameState(): void {
		const gameStateMessage: GameMessage = {
			type: 'game_state_changed',
			data: {
				gameState: this.room.gameState,
				participants: Array.from(this.participants.values()),
				currentRound: this.room.currentRound
			},
			timestamp: Date.now(),
			senderId: this.room.hostId
		};

		this.broadcastToAll(gameStateMessage);
	}

	// 방 정보 업데이트 콜백 호출
	private updateRoom(): void {
		this.onRoomUpdateCallback?.(this.room);
	}

	// 방 정보 업데이트 리스너 설정
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

	// 모든 참가자가 카드를 선택했는지 확인
	areAllCardsSelected(): boolean {
		const nonHostParticipants = Array.from(this.participants.values()).filter((p) => !p.isHost);
		return nonHostParticipants.length > 0 && nonHostParticipants.every((p) => p.selectedCard);
	}

	// 호스트 정리
	cleanup(): void {
		this.connections.forEach((connection) => connection.close());
		this.connections.clear();
		this.participants.clear();
	}
}
