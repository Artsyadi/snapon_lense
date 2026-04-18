import { Router } from 'express';
import { updateCartState } from '../services/cartService.js';
import { getSession, setSessionCart } from '../services/sessionStore.js';
import { validateBody, validated } from '../middleware/validateRequest.js';
import { cartUpdateBodySchema } from '../utils/schemas.js';
import type { z } from 'zod';

export const cartUpdateRouter = Router();

cartUpdateRouter.post('/', validateBody(cartUpdateBodySchema), (req, res) => {
  const body = validated<z.infer<typeof cartUpdateBodySchema>>(req);
  const serverCart = getSession(req.shelfSenseSessionId).cart;
  const result = updateCartState({
    latestItem: body.latestItem,
    cart: serverCart,
  });
  setSessionCart(req.shelfSenseSessionId, result.cart);
  req.shelfSenseSession.cart = result.cart;
  res.json(result);
});
