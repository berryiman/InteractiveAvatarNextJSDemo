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
    const { sessionId, reason = "interview_completed" } = body;

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
    
    // Calculate session duration
    const startTime = new Date(session.createdAt);
    const endTime = new Date(timestamp);
    const durationMs = endTime.getTime() - startTime.getTime();
    const durationMinutes = Math.round(durationMs / 60000 * 100) / 100;

    // Prepare final interview results
    const interviewResults = {
      sessionId,
      status: 'completed',
      reason,
      startedAt: session.createdAt,
      endedAt: timestamp,
      duration: {
        milliseconds: durationMs,
        minutes: durationMinutes,
        formatted: `${Math.floor(durationMinutes)}m ${Math.round((durationMinutes % 1) * 60)}s`
      },
      statistics: {
        totalQuestions: session.transcript.filter((t: any) => t.type === 'avatar_question').length,
        totalResponses: session.responses.length,
        averageResponseTime: session.responses.length > 0 ? 
          session.responses.reduce((acc: number, r: any, i: number) => {
            if (i === 0) return 0;
            const prevTime = new Date(session.transcript[i-1]?.timestamp || session.createdAt);
            const responseTime = new Date(r.timestamp);
            return acc + (responseTime.getTime() - prevTime.getTime());
          }, 0) / session.responses.length / 1000 : 0
      },
      transcript: session.transcript,
      responses: session.responses,
      config: {
        avatarId: session.avatarId,
        language: session.language,
        interviewMode: session.interviewMode
      }
    };

    // Mark session as completed but keep in memory for a while
    session.status = 'completed';
    session.endedAt = timestamp;
    session.reason = reason;
    session.results = interviewResults;

    global.activeSessions.set(sessionId, session);

    // Optional: Schedule cleanup after 1 hour
    setTimeout(() => {
      global.activeSessions.delete(sessionId);
      console.log(`Session ${sessionId} cleaned up from memory`);
    }, 3600000); // 1 hour

    return NextResponse.json({
      success: true,
      message: 'Interview session ended successfully',
      results: interviewResults
    });

  } catch (error) {
    console.error('Error ending session:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to end interview session',
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

  if (session.status !== 'completed') {
    return NextResponse.json(
      { success: false, error: 'Session is not completed yet' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    results: session.results
  });
}
