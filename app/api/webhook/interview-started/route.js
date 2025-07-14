export async function POST(request) {
  try {
    const data = await request.json();
    console.log('✅ Interview started webhook received:', data);
    
    // Return success
    return Response.json({ 
      success: true, 
      message: 'Interview started webhook received',
      sessionId: data.sessionId 
    });
    
  } catch (error) {
    console.error('❌ Interview started webhook error:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}
