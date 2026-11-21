export const verificationEmailTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #2196F3, #1976D2); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">Verify Your Email</h1>
  </div>
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
    <p>Hello,</p>
    <p>Thank you for signing up! Your verification code is:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2196F3;">{verificationCode}</span>
    </div>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{verificationLink}" style="background-color: #2196F3; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify</a>
    </div>
    <p>Enter this code on the verification page to complete your registration.</p>
    <p>This code will expire in 10 minutes for security reasons.</p>
    <p>If you didn't create an account with us, please ignore this email.</p>
    <p>Best regards,<br>Team Task</p>
  </div>
  <div style="text-align: center; margin-top: 20px; color: #888; font-size: 0.8em;">
    <p>This is an automated message, please do not reply to this email.</p>
  </div>
</body>
</html>
`;

export const passwordResetSuccessTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Password Reset Successful</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(to right, #2196F3, #1976D2); padding: 20px; text-align: center;">
<h1 style="color: white; margin: 0;">Password Reset Successful</h1>
</div>
<div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
<p>Hello,</p>
<p>We're writing to confirm that your password has been successfully reset.</p>
<div style="text-align: center; margin: 30px 0;">
<div style="background-color: #2196F3; color: white; width: 50px; height: 50px; line-height: 50px; border-radius: 50%; display: inline-block; font-size: 30px;">
✓
</div>
</div>
<p>If you did not initiate this password reset, please contact our support team immediately.</p>
<p>For security reasons, we recommend that you:</p>
<ul>
<li>Use a strong, unique password</li>
<li>Enable two-factor authentication if available</li>
<li>Avoid using the same password across multiple sites</li>
</ul>
<p>Thank you for helping us keep your account secure.</p>
<p>Best regards,<br>Your App Team</p>
</div>
<div style="text-align: center; margin-top: 20px; color: #888; font-size: 0.8em;">
<p>This is an automated message, please do not reply to this email.</p>
</div>
</body>
</html>
`;

export const passwordResetRequestTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset Your Password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
<div style="background: linear-gradient(to right, #2196F3, #1976D2); padding: 20px; text-align: center;">
<h1 style="color: white; margin: 0;">Password Reset</h1>
</div>
<div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
<p>Hello,</p>
<p>We received a request to reset your password. If you didn't make this request, please ignore this email.</p>
<p>To reset your password, click the button below:</p>
<div style="text-align: center; margin: 30px 0;">
<a href="{resetURL}" style="background-color: #2196F3; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
</div>
<p>This link will expire in 1 hour for security reasons.</p>
<p>Best regards,<br>Your App Team</p>
</div>
<div style="text-align: center; margin-top: 20px; color: #888; font-size: 0.8em;">
<p>This is an automated message, please do not reply to this email.</p>
</div>
</body>
</html>
`;

export const workspaceInvitationTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited!</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #2196F3, #1976D2); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">You're Invited to a Workspace!</h1>
  </div>
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
    <p>Hello,</p>
    <p>You have been invited by <strong>{inviterName}</strong> to join the <strong>{workspaceName}</strong> workspace on Team Task.</p>
    <p>Team Task is a powerful tool for collaboration and project management. Join the workspace to start collaborating on tasks, projects, and more!</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="{inviteURL}" style="background-color: #2196F3; color: white; padding: 12px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Join Workspace</a>
    </div>
    <p>If you're unable to click the button, you can copy and paste the following URL into your browser:</p>
    <p style="word-break: break-all; font-size: 0.9em; background-color: #eee; padding: 10px; border-radius: 5px;">{inviteURL}</p>
    <p>We look forward to seeing you there!</p>
    <p>Best regards,<br>Team Task</p>
  </div>
  <div style="text-align: center; margin-top: 20px; color: #888; font-size: 0.8em;">
    <p>This is an automated message, please do not reply to this email.</p>
  </div>
</body>
</html>
`;

export const passwordResetCodeTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(to right, #2196F3, #1976D2); padding: 20px; text-align: center;">
    <h1 style="color: white; margin: 0;">Reset your password</h1>
  </div>
  <div style="background-color: #f9f9f9; padding: 20px; border-radius: 0 0 5px 5px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
    <p>Hello,</p>
    <p>Use this code to choose a new password for Team Task:</p>
    <div style="text-align: center; margin: 30px 0;">
      <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2196F3;">{resetCode}</span>
    </div>
    <p>The code expires in 10 minutes. If you didn't ask to reset your password, you can ignore this email: your password stays the same.</p>
    <p>Best regards,<br>Team Task</p>
  </div>
</body>
</html>
`;
