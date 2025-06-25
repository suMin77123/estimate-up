export interface User {
	id: string;
	name: string;
	isHost: boolean;
	connected: boolean;
	selectedCard?: string;
}

export interface Room {
	id: string;
	hostId: string;
	participants: Map<string, User>;
	gameState: 'waiting' | 'voting' | 'revealed';
	cards: string[];
	currentRound: number;
}

export interface GameMessage {
	type:
		| 'user_joined'
		| 'user_left'
		| 'card_selected'
		| 'game_state_changed'
		| 'host_changed'
		| 'emoji_sent';
	data: Record<string, unknown>;
	timestamp: number;
	senderId: string;
}

export type GameState = 'waiting' | 'voting' | 'revealed';

export interface EmojiMessage {
	from: string;
	to: string;
	emoji: string;
	timestamp: number;
}
