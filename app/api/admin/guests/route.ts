import { NextRequest, NextResponse } from 'next/server'
import { getAllGuests, createGuest, deleteGuest } from '@/lib/db-wrapper'
import { parseSessionToken } from '@/lib/auth-utils'
import { generateGuestCode } from '@/lib/auth-utils'

export const dynamic = 'force-dynamic'

async function verifyAdminToken(request: NextRequest): Promise<boolean> {
  // Try cookie first (new auth)
  const sessionCookie = request.cookies.get('hochzeit_session')
  if (sessionCookie?.value) {
    const session = await parseSessionToken(sessionCookie.value)
    return session?.role === 'admin'
  }

  // Fallback to Bearer token (legacy/SPA auth)
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const session = await parseSessionToken(token)
    return session?.role === 'admin'
  }

  return false
}

/**
 * GET /api/admin/guests
 * Get all guests (admin only)
 */
export async function GET(request: NextRequest) {
  console.log('[API GET /admin/guests] Starting request')
  
  if (!(await verifyAdminToken(request))) {
    console.log('[API GET /admin/guests] Unauthorized')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    console.log('[API GET /admin/guests] Fetching guests from DB...')
    const guests = await getAllGuests()
    console.log(`[API GET /admin/guests] Found ${guests.length} guests`)
    return NextResponse.json({ guests })
  } catch (error) {
    console.error('[API GET /admin/guests] Error:', error)
    return NextResponse.json(
      { error: 'Fehler beim Abrufen der Gästeliste' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/guests
 * Create new guest (admin only)
 */
export async function POST(request: NextRequest) {
  console.log('[API POST /admin/guests] Starting request')
  
  if (!(await verifyAdminToken(request))) {
    console.log('[API POST /admin/guests] Unauthorized')
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    console.log('[API POST /admin/guests] Request body:', body)
    
    const { name, email, code: customCode } = body

    // Validation
    if (!name || !email) {
      console.log('[API POST /admin/guests] Validation failed - missing name or email')
      return NextResponse.json(
        { error: 'Name und E-Mail erforderlich' },
        { status: 400 }
      )
    }

    // Generate code if not provided
    const code = customCode || generateGuestCode('readable')
    console.log(`[API POST /admin/guests] Creating guest: ${name}, ${email}, code: ${code}`)

    // Create guest
    const guest = await createGuest({
      name,
      email,
      code,
    })
    
    console.log('[API POST /admin/guests] Guest created:', guest)

    return NextResponse.json(
      {
        guest,
        message: `Gast "${name}" mit Code ${code} erstellt`,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('[API POST /admin/guests] Error:', error)

    if (error.message?.includes('UNIQUE') || error.message?.includes('already exists')) {
      return NextResponse.json(
        { error: 'E-Mail oder Code existiert bereits' },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { error: 'Gast konnte nicht erstellt werden', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/guests
 * Delete guest by code (admin only)
 */
export async function DELETE(request: NextRequest) {
  console.log('[API DELETE /admin/guests] Starting request')
  
  if (!(await verifyAdminToken(request))) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const { code } = body

    if (!code) {
      return NextResponse.json(
        { error: 'Code erforderlich' },
        { status: 400 }
      )
    }

    const deleted = await deleteGuest(code)
    if (!deleted) {
      return NextResponse.json(
        { error: 'Gast nicht gefunden' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      message: `Gast mit Code ${code} gelöscht`,
    })
  } catch (error) {
    console.error('[API DELETE /admin/guests] Error:', error)
    return NextResponse.json(
      { error: 'Gast konnte nicht gelöscht werden' },
      { status: 500 }
    )
  }
}
