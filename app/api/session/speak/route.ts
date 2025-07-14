import { NextRequest, NextResponse } from 'next/server';

// Import the same session store (in production, use shared Redis/DB)
declare global {
  var activeSessions: Map<string, any>;
}

if (!global.activeSessions) {
  global.activeSessions = new Map();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, text, taskType = "repeat", questionType = "interview" } = body;

    if (!sessionId || !text) {
      return NextResponse.json(
        { success: false, error: 'sessionId and text are required' },
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

    // Add to transcript
    const timestamp = new Date().toISOString();
    session.transcript.push({
      type: 'avatar_question',
      text,
      timestamp,
      questionType,
      taskType
    });

    // Update session status
    session.status = 'speaking';
    session.lastActivity = timestamp;

    // Store the question for response correlation
    session.currentQuestion = {
      text,
      questionType,
      timestamp,
      taskType
    };

    global.activeSessions.set(sessionId, session);

    return NextResponse.json({
      success: true,
      sessionId,
      message: 'Avatar will speak the question',
      questionSent: text,
      taskType,
      timestamp,
      transcript: session.transcript,
      // Return data needed for HeyGen SDK
      speakData: {
        text,
        task_type: taskType,
        task_mode: "sync"
      }
    });

  } catch (error) {
    console.error('Error in speak endpoint:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to send question to avatar',
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
    currentQuestion: session.currentQuestion,
    status: session.status,
    transcript: session.transcript
  });
}
