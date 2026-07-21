import { parsePhoneNumberWithError, isValidPhoneNumber } from 'libphonenumber-js';
import logger from './logger.js';

/**
 * Format phone number to E.164 format.
 * Defaults to 'IN' (India) if no country code is provided in the input,
 * but handles any international number starting with '+'.
 */
export const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  try {
    const phoneNumber = parsePhoneNumberWithError(phone, 'IN');
    return phoneNumber.format('E.164');
  } catch (err) {
    logger.debug(`Invalid phone number format: ${phone}`);
    return null;
  }
};

export const validatePhoneNumber = (phone) => {
  try {
    return isValidPhoneNumber(phone, 'IN');
  } catch (err) {
    return false;
  }
};

export const formatPhoneNumberByCountry = (phone, countryCode = 'IN') => {
  if (!phone) return null;
  try {
    const phoneNumber = parsePhoneNumberWithError(phone, countryCode);
    return phoneNumber.format('E.164');
  } catch (err) {
    return null;
  }
};

export const extractCountryCode = (phone) => {
  if (!phone) return null;
  try {
    const phoneNumber = parsePhoneNumberWithError(phone, 'IN');
    return '+' + phoneNumber.countryCallingCode;
  } catch (err) {
    return null;
  }
};

export const getDisplayFormat = (phone) => {
  if (!phone) return phone;
  try {
    const phoneNumber = parsePhoneNumberWithError(phone, 'IN');
    return phoneNumber.formatInternational();
  } catch (err) {
    return phone;
  }
};