import { NextRequest, NextResponse } from 'next/server';

declare global {
  var activeSessions: Map<string, any>;
}

if (!global.activeSessions) {
  global.activeSessions = new Map();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sessionId, 
      responseText, 
      responseType = "voice", 
      confidence = null,
      duration = null 
    } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required' },
        { status: 400 }
      );
    }

    // Get session data
    const session = global.activeSessions.get(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Session not found' },
        { status: 404 }
      );
    }

    const timestamp = new Date().toISOString();
    
    // Add user response to transcript
    const responseEntry = {
      type: 'user_response',
      text: responseText || '[No response detected]',
      timestamp,
      responseType,
      confidence,
      duration,
      questionId: session.currentQuestion?.timestamp || null
    };

    session.transcript.push(responseEntry);
    session.responses.push(responseEntry);

    // Update session status
    session.status = 'waiting';
    session.lastActivity = timestamp;
    session.lastResponse = responseEntry;

    global.activeSessions.set(sessionId, session);

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'User response recorded',
      response: responseEntry,
      totalResponses: session.responses.length,
      transcript: session.transcript
    });

  } catch (error) {
    console.error('Error recording response:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to record user response',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json(
      { success: false, error: 'sessionId parameter is required' },
      { status: 400 }
    );
  }

  const session = global.activeSessions.get(sessionId);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Session not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    sessionId,
    responses: session.responses,
    lastResponse: session.lastResponse,
    totalResponses: session.responses.length,
    transcript: session.transcript
  });
}
