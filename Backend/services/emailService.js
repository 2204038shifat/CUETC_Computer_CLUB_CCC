const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// ==================== SEND EVENT REGISTRATION CONFIRMATION ====================
const sendEventConfirmation = async (email, eventName, registrationDetails) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `✅ Event Registration Confirmed - ${eventName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <div style="background: linear-gradient(135deg, #6366f1, #7c3aed); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h2 style="margin: 0;">🎉 Registration Confirmed!</h2>
                </div>
                
                <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
                    <p>Dear <strong>${registrationDetails.fullName}</strong>,</p>
                    
                    <p>Your registration for <strong>${eventName}</strong> has been successfully confirmed!</p>
                    
                    <h3 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">Registration Details:</h3>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Name:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${registrationDetails.fullName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Email:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${registrationDetails.email}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Phone:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${registrationDetails.phone}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>T-Shirt Size:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${registrationDetails.tshirtSize || 'N/A'}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${registrationDetails.amount} ${registrationDetails.currency || 'BDT'}</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payment Gateway:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${registrationDetails.paymentGateway}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;"><strong>Transaction ID:</strong></td>
                            <td style="padding: 8px;"><code style="background: #f0f0f0; padding: 5px; border-radius: 5px;">${registrationDetails.transactionId}</code></td>
                        </tr>
                    </table>
                    
                    <p style="margin-top: 20px; color: #666; font-size: 14px;">
                        <strong>⚠️ Important:</strong> Keep your transaction ID for reference. You'll need it if you need to cancel or modify your registration.
                    </p>
                    
                    <p style="color: #666; font-size: 14px;">
                        If you have any questions or need assistance, please contact us at 
                        <a href="mailto:support@cuetcomputerclub.com">support@cuetcomputerclub.com</a>
                    </p>
                    
                    <p style="margin-top: 20px; color: #999; font-size: 12px;">
                        Best Regards,<br>
                        <strong>CUET Computer Club</strong>
                    </p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Event confirmation email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending event confirmation email:', error);
        return { success: false, error: error.message };
    }
};

// ==================== SEND CONTEST REGISTRATION CONFIRMATION ====================
const sendContestConfirmation = async (email, contestName, teamDetails) => {
    const membersHtml = teamDetails.teamMembers
        .map((member, index) => `
            <tr>
                <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Member ${index + 1}:</strong></td>
                <td style="padding: 8px; border-bottom: 1px solid #eee;">${member.name} (${member.email})</td>
            </tr>
        `)
        .join('');

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `✅ Team Registration Confirmed - ${contestName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <div style="background: linear-gradient(135deg, #6366f1, #7c3aed); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h2 style="margin: 0;">🏆 Team Registration Confirmed!</h2>
                </div>
                
                <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
                    <p>Dear <strong>${teamDetails.leadName}</strong>,</p>
                    
                    <p>Your team's registration for <strong>${contestName}</strong> has been successfully confirmed!</p>
                    
                    <h3 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px;">Team Details:</h3>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Team Name:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${teamDetails.teamName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Team Lead:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${teamDetails.leadName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Lead Email:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${teamDetails.leadEmail}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Amount Paid:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${teamDetails.amount} ${teamDetails.currency || 'BDT'}</strong></td>
                        </tr>
                        <tr>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Payment Gateway:</strong></td>
                            <td style="padding: 8px; border-bottom: 1px solid #eee;">${teamDetails.paymentGateway}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px;"><strong>Transaction ID:</strong></td>
                            <td style="padding: 8px;"><code style="background: #f0f0f0; padding: 5px; border-radius: 5px;">${teamDetails.transactionId}</code></td>
                        </tr>
                    </table>
                    
                    <h3 style="color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; margin-top: 20px;">Team Members:</h3>
                    
                    <table style="width: 100%; border-collapse: collapse;">
                        ${membersHtml}
                    </table>
                    
                    <p style="margin-top: 20px; color: #666; font-size: 14px;">
                        <strong>⚠️ Important:</strong> Keep your transaction ID for reference. Best of luck in the contest! 🎯
                    </p>
                    
                    <p style="color: #666; font-size: 14px;">
                        If you have any questions, please contact us at 
                        <a href="mailto:support@cuetcomputerclub.com">support@cuetcomputerclub.com</a>
                    </p>
                    
                    <p style="margin-top: 20px; color: #999; font-size: 12px;">
                        Best Regards,<br>
                        <strong>CUET Computer Club</strong>
                    </p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Contest confirmation email sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending contest confirmation email:', error);
        return { success: false, error: error.message };
    }
};

// ==================== SEND PAYMENT VERIFICATION INSTRUCTIONS ====================
const sendPaymentInstructions = async (email, paymentDetails) => {
    const paymentMethods = {
        bKash: {
            number: '01XXXXXXXXX',
            instructions: '1. Go to any bKash merchant\n2. Say "Send Money"\n3. Enter the account mentioned above\n4. Enter amount\n5. Confirm and get transaction ID'
        },
        Nagad: {
            number: '01XXXXXXXXX',
            instructions: '1. Open Nagad app or dial USSD\n2. Select "Send Money"\n3. Enter the account number\n4. Enter amount\n5. Confirm transaction\n6. Get confirmation message with transaction ID'
        },
        Rocket: {
            number: '01XXXXXXXXX',
            instructions: '1. Open Rocket app\n2. Select "Send Money"\n3. Enter the account number\n4. Enter amount\n5. Confirm and get transaction ID'
        }
    };

    const method = paymentMethods[paymentDetails.gateway] || paymentMethods.bKash;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `💳 Payment Instructions - ${paymentDetails.eventName}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f9fa; border-radius: 10px;">
                <div style="background: linear-gradient(135deg, #6366f1, #7c3aed); color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center;">
                    <h2 style="margin: 0;">💳 Payment Instructions</h2>
                </div>
                
                <div style="background: white; padding: 20px; border-radius: 0 0 10px 10px;">
                    <p>Dear ${paymentDetails.userName},</p>
                    
                    <p>Thank you for registering for <strong>${paymentDetails.eventName}</strong>!</p>
                    
                    <p>Please proceed with payment using the following details:</p>
                    
                    <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <p><strong>Payment Gateway:</strong> ${paymentDetails.gateway}</p>
                        <p><strong>Account Number:</strong> <code style="background: white; padding: 5px; border-radius: 5px; font-weight: bold;">${method.number}</code></p>
                        <p><strong>Amount:</strong> <strong>${paymentDetails.amount} BDT</strong></p>
                    </div>
                    
                    <h4>How to Pay:</h4>
                    <pre style="background: #f8f9fa; padding: 10px; border-radius: 5px; overflow-x: auto;">${method.instructions}</pre>
                    
                    <p style="color: #666; margin-top: 20px;">
                        <strong>⚠️ Important:</strong> After payment, you will receive a transaction ID. 
                        Please keep this ID safe as you'll need to submit it to complete your registration.
                    </p>
                    
                    <p style="color: #999; font-size: 12px; margin-top: 20px;">
                        If you face any issues, please contact us at 
                        <a href="mailto:support@cuetcomputerclub.com">support@cuetcomputerclub.com</a>
                    </p>
                </div>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✅ Payment instructions sent to ${email}`);
        return { success: true };
    } catch (error) {
        console.error('❌ Error sending payment instructions:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    sendEventConfirmation,
    sendContestConfirmation,
    sendPaymentInstructions
};