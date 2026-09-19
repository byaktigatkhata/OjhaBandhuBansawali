import { serve } from "https://deno.land/std@0.177.0/http/server.ts"

const CLOUDINARY_CLOUD_NAME = Deno.env.get('CLOUDINARY_CLOUD_NAME') || 'lv6z41ky';
const CLOUDINARY_API_KEY = Deno.env.get('CLOUDINARY_API_KEY') || '';
const CLOUDINARY_API_SECRET = Deno.env.get('CLOUDINARY_API_SECRET') || '';

console.log(`Cloudinary Cloud Name: ${CLOUDINARY_CLOUD_NAME}`)

serve(async (req) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the public_id from the request body
    const { public_id } = await req.json();
    
    if (!public_id) {
      return new Response(JSON.stringify({ error: 'public_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if Cloudinary credentials are set
    if (!CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      console.error('Cloudinary credentials not set');
      return new Response(JSON.stringify({ 
        error: 'Cloudinary credentials not configured',
        message: 'Please set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your environment variables'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Deleting image with public_id: ${public_id}`);

    // Delete the image from Cloudinary using Admin API
    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`;
    
    // Create form data for Cloudinary API
    const formData = new FormData();
    formData.append('public_id', public_id);
    formData.append('api_key', CLOUDINARY_API_KEY);
    formData.append('timestamp', Math.floor(Date.now() / 1000).toString());
    
    // Generate signature
    const signature = await generateSignature(public_id);
    formData.append('signature', signature);

    const response = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    console.log('Cloudinary delete response:', result);

    if (result.result === 'ok') {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Image deleted successfully',
        result: result
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to delete image',
        result: result
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Error in delete-cloudinary-image function:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

// Function to generate Cloudinary signature
async function generateSignature(public_id: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureString = `public_id=${public_id}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  
  // Create SHA-1 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(signatureString);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return signature;
}