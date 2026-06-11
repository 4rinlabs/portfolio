'use server'

import { prisma } from '@/lib/prisma'
import { sendContactNotification } from '@/lib/mailer'
import { ContactSchema } from '@/lib/schemas'

export type ContactActionState = {
  success: boolean
  message: string
  errors?: Record<string, string[]>
}

export async function submitContact(
  _prev: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const raw = {
    name: formData.get('name') as string,
    email: formData.get('email') as string,
    phone: formData.get('phone') as string,
    company: (formData.get('company') as string) || undefined,
    message: formData.get('message') as string,
  }

  const parsed = ContactSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      success: false,
      message: 'Please fix the highlighted fields.',
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }

  try {
    await prisma.contactLead.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        message: parsed.data.message,
      },
    })

    // Send email notification (non-blocking fail)
    try {
      await sendContactNotification({
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        message: parsed.data.message,
      })
    } catch (emailErr) {
      console.error('Email notification failed (non-fatal):', emailErr)
    }

    return {
      success: true,
      message: 'Message received! We\'ll get back to you soon.',
    }
  } catch (err) {
    console.error('Contact form submission failed:', err)
    return {
      success: false,
      message: 'Submission failed. Please try again.',
    }
  }
}
