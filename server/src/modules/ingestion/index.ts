// Public entry of the pure ingestion module (architecture section 6.1).
export { parseExport, type DateOrder, type Message, type NeedsDateOrder, type Parsed, type Rejected } from './parse';
export { selectEligible, type Pointers, type Selection } from './select';
