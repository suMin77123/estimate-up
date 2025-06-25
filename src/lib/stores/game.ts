import { writable } from 'svelte/store';
import type { Room, User, GameState } from '../types.js';

// 음식 이모티콘 풀
export const foodEmojis = [
	'🍕',
	'🍔',
	'🌭',
	'🍟',
	'🍿',
	'🥨',
	'🥞',
	'🧇',
	'🍩',
	'🍪',
	'🍰',
	'🧁',
	'🍭',
	'🍬',
	'🍫',
	'🍯',
	'🍎',
	'🍌',
	'🍇',
	'🍓',
	'🍑',
	'🥝',
	'🍊',
	'🍋',
	'☕',
	'🥤',
	'🧃',
	'🍻',
	'🍺',
	'🥛',
	'🍵',
	'🧊'
];

// 카드덱 생성 함수
export function generateCardDeck(): string[] {
	const randomFood = foodEmojis[Math.floor(Math.random() * foodEmojis.length)];
	return ['1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '?', randomFood];
}

// 음식 이모티콘 체크 함수
export function isFoodEmoji(card: string): boolean {
	return foodEmojis.includes(card);
}

// 통계 계산 함수
export function calculateStats(votes: Record<string, string>) {
	const numericVotes = Object.values(votes)
		.filter((vote) => vote !== '?' && !isFoodEmoji(vote))
		.map((vote) => {
			if (vote === '1/4') return 0.25;
			if (vote === '1/2') return 0.5;
			return parseFloat(vote);
		});

	const total = numericVotes.reduce((sum, vote) => sum + vote, 0);
	const average = numericVotes.length > 0 ? total / numericVotes.length : 0;

	return {
		average: average.toFixed(1),
		total: total.toFixed(1),
		numericCount: numericVotes.length,
		questionCount: Object.values(votes).filter((v) => v === '?').length,
		foodCount: Object.values(votes).filter((v) => isFoodEmoji(v)).length
	};
}

// 게임 상태 스토어
export const gameState = writable<GameState>('waiting');
export const currentRoom = writable<Room | null>(null);
export const currentUser = writable<User | null>(null);
export const participants = writable<Map<string, User>>(new Map());
export const selectedCard = writable<string | null>(null);
export const isHost = writable<boolean>(false);

// 방 ID 생성
export function generateRoomId(): string {
	return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// 사용자 ID 생성
export function generateUserId(): string {
	return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
