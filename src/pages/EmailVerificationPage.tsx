import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Mail, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function EmailVerificationPage() {
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [isVerified, setIsVerified] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  
  const email = location.state?.email || ''
  const userData = location.state?.userData || {}

  useEffect(() => {
    // Check if user is already verified
    const checkVerification = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email_confirmed_at) {
        setIsVerified(true)
        // Create client profile if it doesn't exist
        await createClientProfile(user, userData)
        setTimeout(() => {
          navigate('/client/thank-you')
        }, 2000)
      }
    }

    checkVerification()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
        setIsVerified(true)
        await createClientProfile(session.user, userData)
        setTimeout(() => {
          navigate('/client/thank-you')
        }, 2000)
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate, userData])

  const createClientProfile = async (user: any, userData: any) => {
    try {
      // Check if profile already exists
      const { data: existingProfile } = await supabase
        .from('clients')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (!existingProfile) {
        const { error } = await supabase
          .from('clients')
          .insert({
            id: user.id,
            name: userData.name || user.user_metadata?.name || 'User',
            email: user.email,
            phone: userData.phone || null,
            company: userData.company || null,
            email_verified: true,
            email_verified_at: new Date().toISOString()
          })

        if (error) {
          console.error('Error creating client profile:', error)
        }
      } else {
        // Update verification status
        await supabase
          .from('clients')
          .update({
            email_verified: true,
            email_verified_at: new Date().toISOString()
          })
          .eq('id', user.id)
      }
    } catch (error) {
      console.error('Error handling client profile:', error)
    }
  }

  const handleResendEmail = async () => {
    if (!email) {
      setResendMessage('Email address not found. Please register again.')
      return
    }

    setIsResending(true)
    setResendMessage('')

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/client/verify-email`
        }
      })

      if (error) {
        setResendMessage('Failed to resend verification email. Please try again.')
      } else {
        setResendMessage('Verification email sent! Please check your inbox.')
      }
    } catch (error) {
      setResendMessage('An error occurred. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  if (isVerified) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Email Verified!
          </h1>
          <p className="text-gray-600 mb-6">
            Your email has been successfully verified. Redirecting you to complete your registration...
          </p>
          <div className="flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mr-2" />
            <span className="text-blue-600">Redirecting...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Verify Your Email
          </h1>
          <p className="text-gray-600">
            We've sent a verification link to:
          </p>
          <p className="font-semibold text-gray-900 mt-2">
            {email}
          </p>
        </div>

        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Check your email</p>
                <p>Click the verification link in your email to activate your account and access the dashboard.</p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">
              Didn't receive the email? Check your spam folder or request a new one.
            </p>
            
            <button
              onClick={handleResendEmail}
              disabled={isResending}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isResending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Resend Email
                </>
              )}
            </button>
            
            {resendMessage && (
              <p className={`mt-3 text-sm ${resendMessage.includes('sent') ? 'text-green-600' : 'text-red-600'}`}>
                {resendMessage}
              </p>
            )}
          </div>

          <div className="pt-4 border-t border-gray-200">
            <button
              onClick={() => navigate('/client/login')}
              className="w-full text-center text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              Already verified? Sign in here
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}