import { Worker } from "bullmq";
import { Model } from "../../models/index.js"
import { connection } from "../../utils/connection.js";
import { deleteFromMinio } from "../../utils/deleteFileFromMinio.js"
import { transporter } from "../../utils/emailTransporter.js";

const worker = new Worker("accountdelete", async (job) => {
    try {
        const { userId } = job.data;

        const isProject = await Model.Project.find({ userid: userId });
        if (isProject.length > 0) {

            for (const project of isProject) {
                const isApiKey = await Model.Apikey.find({ projectid: project._id });
                if (isApiKey.length > 0) {
                    await Model.Apikey.deleteMany({ projectid: project._id })
                }

                const files = await Model.File.find({ projectid: project._id })
                if (files.length > 0) {
                    for (const file of files) {

                        const filename = file.filename;
                        const bucket = file.serveFrom

                        await deleteFromMinio(`${project._id}/${filename}`, bucket === "main" ? process.env.MAIN_BUCKET : process.env.TEMP_BUCKET)
                        await Model.File.findByIdAndDelete(file._id)
                    }
                }

                const isDomain = await Model.Domain.findOne({ projectid: project._id });
                if (isDomain) {
                    await Model.Domain.deleteOne({ projectid: project._id })
                }

                await Model.Project.findByIdAndDelete(project);
            }

        }

        const user = await Model.User.findById(userId)
        await Model.DeleteUserAccountModel.create({
            userId: userId,
            email: user?.email
        })

        await Model.User.findByIdAndDelete(userId)

        const mailOption = {
            from: `Devload <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "Account deletation Completed",
            html: `
            <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>DevLoad Account Deletion Confirmation</title>
    <style>
        /* Reset styles for email clients */
        body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        body { margin: 0; padding: 0; width: 100% !important; background-color: #f5f7fa; font-family: 'Helvetica Neue', Arial, sans-serif; }

        /* Main container */
        .container { width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1); }
        .header { text-align: center; padding: 30px 20px; background: linear-gradient(135deg, #4a90e2, #357abd); }
        .header h1 { margin: 0; font-size: 26px; color: #ffffff; font-weight: 600; }
        .header p { margin: 10px 0 0; color: #d9e4ff; font-size: 14px; }
        .content { padding: 30px; color: #333333; font-size: 16px; line-height: 1.7; }
        .content p { margin: 0 0 15px; }
        .content a { color: #4a90e2; text-decoration: none; font-weight: 500; }
        .content a:hover { text-decoration: underline; }
        .highlight { background-color: #f8fafc; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center; }
        .highlight p { margin: 0; font-size: 15px; color: #555555; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777777; background-color: #f8fafc; border-top: 1px solid #e8ecef; }
        .footer a { color: #4a90e2; text-decoration: none; }
        .footer a:hover { text-decoration: underline; }

        /* Responsive design */
        @media only screen and (max-width: 600px) {
            .container { padding: 10px; border-radius: 0; }
            .header { padding: 20px; }
            .header h1 { font-size: 22px; }
            .content { font-size: 14px; padding: 20px; }
            .highlight { padding: 10px; }
            .footer { font-size: 11px; }
        }
    </style>
</head>
<body>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f7fa;">
        <tr>
            <td align="center" style="padding: 20px 10px;">
                <table role="presentation" class="container" cellspacing="0" cellpadding="0" border="0">
                    <tr>
                        <td class="header">
                            <h1>Account Deletion Completed</h1>
                            <p>Your DevLoad account has been successfully removed.</p>
                        </td>
                    </tr>
                    <tr>
                        <td class="content">
                            <p>Dear ${user.fullName},</p>
                            <p>We have successfully deleted your DevLoad account and all associated personal data from our systems, in accordance with our privacy policy. Thank you for being a part of our community.</p>
                            <div class="highlight">
                                <p>We’re sad to see you go! If you change your mind, you’re welcome to create a new account with DevLoad But After 30days from Acoount Deletion.</p>
                            </div>
                            <p>If you believe this deletion was made in error or have any questions, please reach out to our support team at <a href="mailto:support@cloudcoderhub.in">support@cloudcoderhub.in</a>. We’re here to assist you.</p>
                            <p>Best regards,<br>The DevLoad Team</p>
                        </td>
                    </tr>
                    <tr>
                        <td class="footer">
                            <p>© 2025 DevLoad. All rights reserved.</p>
                            <p><a href="https://devload.cloudcoderhub.in/privacy">Privacy Policy</a> | <a href="https://devload.cloudcoderhub.in/contact">Contact Us</a></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
            `
        }

        await transporter.sendMail(mailOption)

        console.log("Account delete for user", user.fullName);



    } catch (error) {
        console.log(error)
        throw error
    }
}, { connection })

worker.on("completed", async (job) => {
    console.log("all data Deleated of user", job.data.userId)
})