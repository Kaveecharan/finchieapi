// utils/generateUsername.js
import { userRepository } from "../repositories/user.repository.js";

export const generateUsername = async (firstName) => {
  const base = firstName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");

  while (true) {
    const random = Math.floor(100000 + Math.random() * 900000);

    const username = `${base}${random}`;

    const existing = await userRepository.findByUsername(username);

    if (!existing) {
      return username;
    }
  }
};