// Radiantilyk EMR — Marketing & Offers Routes
// Dedicated REST routes for campaigns, audience preview, review requests, and promo codes.

import { Router, Request, Response, NextFunction } from 'express';
import { MarketingService } from '../services/marketing.service';
import { authenticate } from '../middleware/auth';
import { requireRoles, STAFF_ROLES } from '../middleware/rbac';
import { AuthenticatedRequest } from '../types';

const router = Router();

// ---- Public Route: Canonical Secure Patient Review Submission ----
// Authenticated not required for patient review submission via cryptographically secure token
router.post('/reviews/submit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await MarketingService.submitReviewFeedback(req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Backward compatibility alias for /submit-feedback
router.post('/submit-feedback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await MarketingService.submitReviewFeedback(req.body);
    res.status(200).json({ data: result, ...result });
  } catch (error) {
    next(error);
  }
});

// Apply authentication to all internal staff marketing management routes
router.use(authenticate);

// 1. Audience Preview
router.post('/preview-audience', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const preview = await MarketingService.previewAudience(req.body);
    res.status(200).json({ success: true, data: preview });
  } catch (error) {
    next(error);
  }
});

// 2. Campaigns API
router.get('/campaigns', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const campaigns = await MarketingService.getCampaigns();
    res.status(200).json({ success: true, data: campaigns });
  } catch (error) {
    next(error);
  }
});

router.post('/campaigns', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const campaign = await MarketingService.createCampaign(req.body);
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

router.patch('/campaigns/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const campaign = await MarketingService.updateCampaign(req.params.id as string, req.body);
    res.status(200).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

router.delete('/campaigns/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await MarketingService.deleteCampaign(req.params.id as string);
    res.status(200).json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    next(error);
  }
});

// 3. Reviews API
router.get('/reviews', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await MarketingService.getReviewsData();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/toggle', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { enabled } = req.body;
    const result = await MarketingService.toggleAutoReviews(Boolean(enabled));
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/resend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appointmentId } = req.body;
    const result = await MarketingService.resendReviewRequest(appointmentId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// 4. Offers & Promos API
router.get('/offers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const offers = await MarketingService.getOffersData();
    res.status(200).json({ success: true, data: offers });
  } catch (error) {
    next(error);
  }
});

router.post('/promos', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const promo = await MarketingService.createPromo(req.body);
    res.status(201).json({ success: true, data: promo });
  } catch (error) {
    next(error);
  }
});

router.patch('/promos/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { isActive } = req.body;
    const updated = await MarketingService.togglePromo(req.params.id as string, Boolean(isActive));
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

router.delete('/promos/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await MarketingService.deletePromo(req.params.id as string);
    res.status(200).json({ success: true, message: 'Promo deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/birthday-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updated = await MarketingService.saveBirthdaySettings(req.body);
    res.status(200).json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

export const marketingRouter = router;
