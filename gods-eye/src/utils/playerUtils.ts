/**
 * Utility functions for identifying and categorizing players and events.
 */

/**
 * Check if a user_id represents a human player (UUID) or bot (numeric).
 * 
 * @param userId - The user_id string from the data
 * @returns true if human (UUID), false if bot (numeric)
 */
export function isHumanPlayer(userId: string): boolean {
  // UUIDs are 36 characters long with dashes (e.g., "f4e072fa-b7af-4761-b567-1d95b7ad0108")
  // Bots are short numeric IDs (e.g., "1440", "382")
  // Check if it's a UUID pattern
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(userId);
}

/**
 * Event type categories for filtering and visualization.
 */
export const EventCategory = {
  MOVEMENT:    'movement',
  COMBAT:      'combat',
  LOOT:        'loot',
  ENVIRONMENT: 'environment',
} as const;
export type EventCategory = typeof EventCategory[keyof typeof EventCategory];

/**
 * Categorize an event type into its category.
 */
export function getEventCategory(eventType: string): EventCategory {
  switch (eventType) {
    case 'Position':
    case 'BotPosition':
      return EventCategory.MOVEMENT;
    case 'Kill':
    case 'Killed':
    case 'BotKill':
    case 'BotKilled':
      return EventCategory.COMBAT;
    case 'Loot':
      return EventCategory.LOOT;
    case 'KilledByStorm':
      return EventCategory.ENVIRONMENT;
    default:
      return EventCategory.MOVEMENT;
  }
}

/**
 * Check if an event is a combat event (kill or death).
 */
export function isCombatEvent(eventType: string): boolean {
  return ['Kill', 'Killed', 'BotKill', 'BotKilled'].includes(eventType);
}

/**
 * Check if an event is a death event.
 */
export function isDeathEvent(eventType: string): boolean {
  return ['Killed', 'BotKilled', 'KilledByStorm'].includes(eventType);
}

/**
 * Check if an event is a kill event.
 */
export function isKillEvent(eventType: string): boolean {
  return ['Kill', 'BotKill'].includes(eventType);
}

