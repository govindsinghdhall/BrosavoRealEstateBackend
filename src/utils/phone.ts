/**
 * Normalize Indian phone numbers to E.164 format for WhatsApp
 */
export function normalizeIndianPhoneNumber(phone: string): string | null {
    if (!phone) return null;
  
    // Remove all spaces, dashes, parentheses, dots, and plus
    let cleaned = phone.replace(/[\s\-\(\)\.\+]/g, '');
  
    // Remove leading zeros
    cleaned = cleaned.replace(/^0+/, '');
  
    // If it's a 10-digit number starting with 6-9 (Indian mobile)
    if (/^[6-9]\d{9}$/.test(cleaned)) {
      return '+91' + cleaned;
    }
  
    // If it has 91 prefix (without +)
    if (/^91[6-9]\d{9}$/.test(cleaned)) {
      return '+' + cleaned;
    }
  
    // If it already has +91 prefix
    if (/^\+91[6-9]\d{9}$/.test(cleaned)) {
      return cleaned;
    }
  
    // If it's already international format (10-15 digits)
    if (/^\+\d{10,15}$/.test(cleaned)) {
      return cleaned;
    }
  
    return null;
  }
  
  /**
   * Normalize multiple phone numbers and remove duplicates
   */
  export function normalizePhoneNumbers(phones: string[]): string[] {
    const normalized = phones
      .map(p => normalizeIndianPhoneNumber(p))
      .filter((p): p is string => p !== null);
  
    return [...new Set(normalized)];
  }
  
  /**
   * Validate if a phone number is valid for WhatsApp
   */
  export function isValidWhatsAppPhone(phone: string): boolean {
    return normalizeIndianPhoneNumber(phone) !== null;
  }