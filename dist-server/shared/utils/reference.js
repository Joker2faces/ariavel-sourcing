// Reference generation: RFQ-YYYY-XXXXX where XXXXX is 5 random alphanumeric chars.
// Does not use sequential integers — no counter concurrency problem.
// Uniqueness is checked at the service level against the tenant's existing references.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous: no 0/O or 1/I
export function generateReference(year) {
    const y = year ?? new Date().getFullYear();
    let rand = '';
    for (let i = 0; i < 5; i++) {
        rand += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    return `RFQ-${y}-${rand}`;
}
