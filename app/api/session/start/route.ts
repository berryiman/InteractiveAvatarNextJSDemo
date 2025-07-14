import { NextRequest, NextResponse } from 'next/server';

// Store active sessions in memory (use Redis/DB in production)
const activeSessions = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      avatarId = "Ann_Therapist", 
      language = "en", 
      quality = "low",
      voice = { rate: 1.0, emotion: "FRIENDLY" },
      knowledgeId = null,
      interviewMode = true 
    } = body;

    // Generate access token first
    const tokenResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_API_URL || 'https://api.heygen.com'}/v1/streaming.create_token`, {
      method: 'POST',
      headers: {
        'x-api-key': process.env.HEYGEN_API_KEY!,
        'Content-Type': 'application/json',
      },
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to create access token');
    }

    const { data: tokenData } = await tokenResponse.json();

    // Create session data
    const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionData = {
      id: sessionId,
      accessToken: tokenData.token,
      avatarId,
      language,
      quality,
      voice,
      knowledgeId,
      interviewMode,
      status: 'created',
      createdAt: new Date().toISOString(),
      transcript: [],
      responses: []
    };

    // Store session
    activeSessions.set(sessionId, sessionData);

    return NextResponse.json({
      success: true,
      sessionId,
      accessToken: tokenData.token,
      config: {
        avatarId,
        language,
        quality,
        voice,
        knowledgeId
      },
      message: 'Interview session created successfully'
    });

  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to create interview session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return list of active sessions
  const sessions = Array.from(activeSessions.values()).map(session => ({
    id: session.id,
    status: session.status,
    createdAt: session.createdAt,
    avatarId: session.avatarId,
    interviewMode: session.interviewMode
  }));

  return NextResponse.json({
    success: true,
    activeSessions: sessions.length,
    sessions
  });
}
