// src/lib/mail-template.ts

export const getVerificationEmailHtml = (url: string, userEmail: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
  </head>
  <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
      <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
              <td style="padding: 40px 0; text-align: center;">
                  <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                      <tr>
                          <td style="padding: 40px 40px 20px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">Medi Store</h1>
                          </td>
                      </tr>
                      <tr>
                          <td style="padding: 40px;">
                              <h2 style="margin: 0 0 20px; color: #333333; font-size: 24px; font-weight: bold;">Verify Your Email Address</h2>
                              <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.5;">
                                  Thanks for signing up for Medi Store! Please verify your email address to complete your registration.
                              </p>
                              <table role="presentation" style="margin: 0 auto;">
                                  <tr>
                                      <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                          <a href="${url}" style="display: inline-block; padding: 16px 40px; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">
                                              Verify Email Address
                                          </a>
                                      </td>
                                  </tr>
                              </table>
                              <p style="margin: 30px 0 20px; color: #666666; font-size: 14px; line-height: 1.5;">
                                  Or copy and paste this link: <br/>
                                  <a href="${url}" style="color: #667eea;">${url}</a>
                              </p>
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
