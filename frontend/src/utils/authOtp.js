function deliveryTarget(data, fallbackEmail) {
  return data?.email_masked || data?.email || fallbackEmail || 'your email'
}

export function buildOtpDeliveryMessage(data, fallbackEmail, { resend = false } = {}) {
  const target = deliveryTarget(data, fallbackEmail)
  const otpLength = data?.otp_length || 6
  if (data?.delivery_mode === 'console' && data?.otp_code) {
    const intro = resend
      ? `A new ${otpLength}-digit verification code was generated for ${target}.`
      : `Your ${otpLength}-digit verification code for ${target} is ${data.otp_code}.`
    const notice = data?.delivery_notice || 'Email OTP delivery is still in development.'
    return `${intro} Use OTP ${data.otp_code}. ${notice}`
  }
  return resend
    ? `A new verification code was sent to ${target}.`
    : `We sent a ${otpLength}-digit code to ${target}.`
}

export function buildOtpInputPrompt(data) {
  if (data?.delivery_mode === 'console' && data?.otp_code) {
    return 'Enter the verification code shown above to continue.'
  }
  return 'Enter the verification code from your email.'
}
