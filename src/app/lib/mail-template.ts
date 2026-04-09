export const getVerificationEmailHtml = (url: string, userEmail: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
      <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F9FAFB; color: #374151;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
              <td style="padding: 48px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                          <td style="padding: 32px; text-align: center; background-color: #0D9488;">
                              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.025em;">MediStore</h1>
                          </td>
                      </tr>

                      <!-- Content -->
                      <tr>
                          <td style="padding: 48px 40px;">
                              <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px; font-weight: 700;">Verify your email address</h2>
                              <p style="margin: 0 0 24px; color: #4B5563; font-size: 16px; line-height: 1.6;">
                                  Welcome to MediStore! We're excited to have you on board. To get started, please confirm your email address <strong>${userEmail}</strong> by clicking the button below.
                              </p>

                              <table role="presentation" style="margin: 32px auto;">
                                  <tr>
                                      <td style="border-radius: 8px; background-color: #0D9488;">
                                          <a href="${url}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                              Confirm Email Address
                                          </a>
                                      </td>
                                  </tr>
                              </table>

                              <p style="margin: 32px 0 0; color: #9CA3AF; font-size: 14px; line-height: 1.6; text-align: center;">
                                  If you didn't create an account, you can safely ignore this email.
                              </p>
                          </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                          <td style="padding: 32px; background-color: #F3F4F6; text-align: center;">
                              <p style="margin: 0; color: #6B7280; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">
                                  MediStore Pharmacy & Care
                              </p>
                              <p style="margin: 8px 0 0; color: #9CA3AF; font-size: 12px;">
                                  Providing healthcare solutions right at your doorstep.
                              </p>
                              <div style="margin-top: 16px;">
                                  <a href="#" style="color: #0D9488; text-decoration: none; font-size: 12px; margin: 0 8px;">Privacy Policy</a>
                                  <span style="color: #D1D5DB;">&bull;</span>
                                  <a href="#" style="color: #0D9488; text-decoration: none; font-size: 12px; margin: 0 8px;">Help Center</a>
                              </div>
                          </td>
                      </tr>
                  </table>
              </td>
          </tr>
      </table>
  </body>
  </html>
  `;
};

/**
 * Generates a styled HTML password reset email.
 */
export const getPasswordResetEmailHtml = (url: string, userName: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password</title>
      <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
      </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F9FAFB; color: #374151;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
              <td style="padding: 48px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; border: 1px solid #E5E7EB; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                      <!-- Header -->
                      <tr>
                          <td style="padding: 32px; text-align: center; background-color: #111827;">
                              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">MediStore</h1>
                          </td>
                      </tr>

                      <!-- Content -->
                      <tr>
                          <td style="padding: 48px 40px;">
                              <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px; font-weight: 700;">Reset your password</h2>
                              <p style="margin: 0 0 24px; color: #4B5563; font-size: 16px; line-height: 1.6;">
                                  Hi ${userName},<br/><br/>
                                  We received a request to reset your password. Click the button below to choose a new one. This link will expire in 1 hour.
                              </p>

                              <table role="presentation" style="margin: 32px auto;">
                                  <tr>
                                      <td style="border-radius: 8px; background-color: #0D9488;">
                                          <a href="${url}" style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                                              Reset Password
                                          </a>
                                      </td>
                                  </tr>
                              </table>

                              <p style="margin: 32px 0 0; color: #9CA3AF; font-size: 14px; line-height: 1.6; text-align: center;">
                                  If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
                              </p>
                          </td>
                      </tr>

                      <!-- Footer -->
                      <tr>
                          <td style="padding: 32px; background-color: #F3F4F6; text-align: center;">
                              <p style="margin: 0; color: #6B7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">
                                  MediStore Pharmacy
                              </p>
                              <div style="margin-top: 16px;">
                                  <a href="#" style="color: #0D9488; text-decoration: none; font-size: 12px;">Contact Support</a>
                              </div>
                          </td>
                      </tr>
                  </table>
              </td>
          </tr>
      </table>
  </body>
  </html>
  `;
};
