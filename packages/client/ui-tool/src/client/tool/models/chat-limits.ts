/**
 * Row geometry of the Web chat: lines a resident card body shows before its
 * middle collapses. A chat row is a summary surface inside the message flow, so
 * it keeps fewer lines than the details panel. These are design constants of the
 * GUI layout, not deployment choices, so they are fixed here rather than plugin
 * Config fields.
 * @module
 */

/** Room for a path, one removed/added pair, and three context lines on each side. */
export const CHAT_DIFF_MAX_LINES = 9

/** Content lines a read card shows in the chat row. */
export const CHAT_READ_MAX_LINES = 8

/** Result rows a search card shows in the chat row. */
export const CHAT_SEARCH_MAX_LINES = 8
