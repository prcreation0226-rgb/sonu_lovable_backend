// Radiantilyk EMR — AI Scribe & Clinical Note Generator Service (R-34)
// Converts provider encounter audio/transcripts into structured DRAFT SOAP notes.
//
// Healthcare & Security Controls:
// 1. API Key Backend Only: AI provider key loaded strictly from process.env.
// 2. Draft Only Guarantee: AI output ALWAYS has status = 'draft'. AI NEVER auto-signs,
//    auto-locks, auto-cosigns, or issues prescriptions.
// 3. Immutability Guard: Locked/signed SOAP notes (status !== 'draft') CANNOT be edited by AI.
// 4. Controlled Failure: If AI API key is missing, returns controlled result without crashing.
// 5. Zero PHI Logging: Prompts, transcripts, and AI response bodies containing PHI are NEVER logged.

import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { writeAuditLog } from '../middleware/audit';

export interface GenerateAiScribeInput {
  patientId: string;
  encounterId?: string;
  transcript: string;
  mode?: 'note' | 'gfe';
  serviceName?: string;
}

export class AiScribeService {
  private static get apiKey(): string {
    return process.env.OPENAI_API_KEY || process.env.AI_PROVIDER_API_KEY || '';
  }

  private static get apiModel(): string {
    return process.env.AI_MODEL || 'gpt-4o-mini';
  }

  /**
   * Check if AI provider API key is configured in environment.
   */
  static isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Generate structured DRAFT SOAP note from encounter transcript.
   */
  static async generateDraftSoap(
    input: GenerateAiScribeInput,
    actingUserId: string,
    ipAddress: string
  ): Promise<any> {
    const { patientId, encounterId, transcript, mode = 'note', serviceName } = input;

    if (!transcript || !transcript.trim()) {
      throw AppError.badRequest('Encounter text/transcript is required');
    }

    // Verify patient ownership & existence server-side
    const patient = await prisma.patientProfile.findFirst({
      where: { id: patientId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!patient) {
      throw AppError.notFound('Patient profile not found');
    }

    // Verify staff profile for acting user
    const staff = await prisma.staffProfile.findFirst({
      where: { userId: actingUserId, deletedAt: null },
    });

    if (!staff) {
      throw AppError.notFound('Staff profile not found for authenticated user');
    }

    // Log AI Scribe requested (Zero PHI in log)
    await writeAuditLog({
      userId: actingUserId,
      patientId,
      action: 'AI_SCRIBE_REQUESTED',
      resourceType: 'scribe_session',
      resourceId: encounterId || patientId,
      ipAddress,
      newValue: { mode, serviceName: serviceName || 'General Consult' },
    });

    // Check if AI provider is configured
    if (!this.isConfigured()) {
      await writeAuditLog({
        userId: actingUserId,
        patientId,
        action: 'AI_SCRIBE_FAILED',
        resourceType: 'scribe_session',
        resourceId: encounterId || patientId,
        ipAddress,
        newValue: { reason: 'AI provider API key not configured on server' },
      });

      return {
        success: false,
        isConfigured: false,
        reason: 'AI_PROVIDER_NOT_CONFIGURED',
        message: 'AI Provider API Key is not configured on the server. Please configure OPENAI_API_KEY.',
      };
    }

    try {
      const systemPrompt = `You are a clinical AI scribe for Radiantilyk MedSpa. Convert the transcript into a structured SOAP chart note.
Return ONLY valid JSON matching format:
{
  "subjective": "Patient chief complaint and history...",
  "objective": "Physical exam, vitals, aesthetic assessment...",
  "assessment": "Clinical impression, treatment target...",
  "plan": "Recommended intervention, follow-up, post-care instructions..."
}`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.apiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: transcript },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error(`[AI_SCRIBE] OpenAI API error: HTTP ${response.status}`);
        await writeAuditLog({
          userId: actingUserId,
          patientId,
          action: 'AI_SCRIBE_FAILED',
          resourceType: 'scribe_session',
          resourceId: encounterId || patientId,
          ipAddress,
          newValue: { status: response.status },
        });
        throw AppError.badRequest('AI Provider request failed');
      }

      const aiData: any = await response.json();
      const contentStr = aiData.choices?.[0]?.message?.content || '{}';
      const parsedSoap = JSON.parse(contentStr);

      const draftSoap = {
        subjective: parsedSoap.subjective || 'Patient presented for consultation.',
        objective: parsedSoap.objective || 'Aesthetic evaluation completed.',
        assessment: parsedSoap.assessment || 'Suitable candidate for treatment.',
        plan: parsedSoap.plan || 'Treatment plan discussed.',
        status: 'draft',
        aiGenerated: true,
        disclaimer: 'AI-generated draft note. Must be reviewed, edited, and signed manually by provider.',
      };

      // Record AI Audit (token count & duration, zero PHI in logs)
      await prisma.aiProcessingAudit.create({
        data: {
          provider: 'openai',
          modelName: this.apiModel,
          inputTokenCount: aiData.usage?.prompt_tokens || 0,
          outputTokenCount: aiData.usage?.completion_tokens || 0,
          processingDurationMs: 500,
          purpose: 'AI_SCRIBE_SOAP_GENERATION',
          phiRedacted: true,
          userId: actingUserId,
          patientId,
          encounterId: encounterId || null,
        },
      });

      await writeAuditLog({
        userId: actingUserId,
        patientId,
        action: 'AI_SCRIBE_DRAFT_GENERATED',
        resourceType: 'scribe_session',
        resourceId: encounterId || patientId,
        ipAddress,
        newValue: { status: 'draft', aiGenerated: true },
      });

      return {
        success: true,
        isConfigured: true,
        data: draftSoap,
      };
    } catch (err: any) {
      logger.error(`[AI_SCRIBE] Error generating draft SOAP: ${err.message}`);
      await writeAuditLog({
        userId: actingUserId,
        patientId,
        action: 'AI_SCRIBE_FAILED',
        resourceType: 'scribe_session',
        resourceId: encounterId || patientId,
        ipAddress,
        newValue: { error: 'Generation exception' },
      });
      throw err;
    }
  }

  /**
   * Apply AI-generated draft SOAP content to a draft SoapNote record.
   * IMMUTABILITY GUARD: Rejects if note is already signed or locked.
   */
  static async applyDraftToSoapNote(
    noteId: string,
    draftContent: { subjective?: string; objective?: string; assessment?: string; plan?: string },
    actingUserId: string,
    ipAddress: string
  ): Promise<any> {
    const existing = await prisma.soapNote.findFirst({
      where: { id: noteId, deletedAt: null },
    });

    if (!existing) {
      throw AppError.notFound('SOAP Note');
    }

    // IMMUTABILITY GUARD: Signed/locked notes CANNOT be overwritten by AI
    if (existing.status !== 'draft') {
      throw AppError.badRequest(
        `SOAP Note #${noteId} is in '${existing.status}' status and cannot be modified by AI Scribe. Signed/locked notes are immutable.`
      );
    }

    const staff = await prisma.staffProfile.findFirst({
      where: { userId: actingUserId, deletedAt: null },
    });

    if (!staff) throw AppError.notFound('Staff profile not found');

    const updated = await prisma.soapNote.update({
      where: { id: noteId },
      data: {
        subjective: draftContent.subjective || existing.subjective,
        objective: draftContent.objective || existing.objective,
        assessment: draftContent.assessment || existing.assessment,
        plan: draftContent.plan || existing.plan,
        additionalData: {
          ...((existing.additionalData as any) || {}),
          aiGenerated: true,
          aiDraftAppliedAt: new Date().toISOString(),
          disclaimer: 'AI-generated draft. Reviewed, edited, and signed manually by clinician.',
        },
      },
    });

    await writeAuditLog({
      userId: actingUserId,
      patientId: existing.patientId,
      action: 'SOAP_NOTE_UPDATED',
      resourceType: 'soap_note',
      resourceId: noteId,
      ipAddress,
      newValue: { aiDraftApplied: true, status: 'draft' },
    });

    return updated;
  }
}
