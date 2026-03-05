import { uploadFilesOnMinio } from "../../../utils/uploadOnMinio.js"
import { makeQueue } from "../../../utils/makeQueue.js";
import { Model } from "../../../models/index.js";
import fs from "fs";
import sharp from "sharp";
import { generateSignedUrl } from "../../../utils/getSignedUrl.js";


export const uplaodFile = async (req, res) => {
    try {
        const project = req.project;
        const user = req.user;
        let finalBuffer;
        let uploadFilename = req.file.filename;
        let contentType = req.file.mimetype;
        let serveFrom;
        let underProcessing = false
        const isImage = req.file.mimetype.startsWith("image/");
        const isVideo = req.file.mimetype.startsWith("video/");

        if (req.file.size > project.maxfilesize) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                message: "max file size! please check your project setting"
            })
        }

        if (isImage) {
            const originalBuffer = await fs.promises.readFile(req.file.path);
            finalBuffer = await sharp(originalBuffer)
                .rotate()
                .resize({
                    width: 2000,
                    withoutEnlargement: true,
                })
                .webp({
                    quality: 82,
                    effort: 6,
                    smartSubsample: true,
                })
                .toBuffer();

            uploadFilename =
                req.file.filename.split(".")[0] + ".webp";

            contentType = "image/webp";
        } else {
            finalBuffer = fs.readFileSync(req.file.path);
        }

        const filesize = finalBuffer.length

        const fileType = isImage ? "image" : isVideo ? "video" : "audio";


        const isAllowed = await Model.Project.findOne({
            _id: project._id,
            userid: user._id,
            $expr: {
                $lte: [
                    { $add: ["$storageUsed", "$storageProcessing", filesize] },
                    "$projectstoragelimit"
                ]
            }
        });


        const isAlloweds = await Model.User.findOne({
            _id: user._id,
            $expr: {
                $lte: [
                    { $add: ["$storageUsed", filesize] },
                    "$maxStorage"
                ]
            }
        });


        if (!isAlloweds) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                message:
                    "your storage quota exceeded",
            });
        }

        if (!isAllowed) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                message:
                    "your project storage quota exceeded",
            });
        }


        if (isVideo) {
            if (user.subscription === "member") {

                if (project.isOptimise) {

                    const videoProcessingQueue = makeQueue(
                        "devload-video-processing"
                    );

                    await uploadFilesOnMinio(
                        project._id.toString(),
                        uploadFilename,
                        finalBuffer,
                        contentType,
                        process.env.TEMP_BUCKET
                    );

                    const url = await generateSignedUrl(
                        process.env.TEMP_BUCKET,
                        `${project._id}/${uploadFilename}`,
                        process.env.ENDPOINT,
                        process.env.ACCESS_ID,
                        process.env.ACCESS_KEY
                    );


                    serveFrom = "temp"
                    underProcessing = true

                    await videoProcessingQueue.add(
                        "devload-video-processing",
                        {
                            url,
                            projectId: project._id,
                            filename: req.file.filename,
                            userFullname: user.fullName,
                            userEmail: user.email,
                            userEmailSendPreference: project.emailSendPreference,
                        },
                        {
                            // retry config
                            attempts: 3,
                            backoff: {
                                type: "exponential",
                                delay: 10000
                            },
                            removeOnComplete: true,
                            removeOnFail: false
                        }
                    );
                    await Model.Project.updateOne(
                        {
                            userid: user._id,
                            _id: project._id,
                        },
                        {
                            $inc: {
                                totalUploads: 1,
                                requestsUsed: 1,
                                storageProcessing: filesize,
                            },
                        }
                    );
                } else {

                    await uploadFilesOnMinio(
                        project._id.toString(),
                        uploadFilename,
                        finalBuffer,
                        contentType,
                        process.env.MAIN_BUCKET
                    );
                    await Model.Project.updateOne(
                        {
                            userid: user._id,
                            _id: project._id,
                        },
                        {
                            $inc: {
                                totalUploads: 1,
                                requestsUsed: 1,
                                storageUsed: filesize,
                            },
                        }
                    );
                }
            }
        } else {

            await uploadFilesOnMinio(
                project._id.toString(),
                req.file.filename,
                finalBuffer,
                contentType,
                process.env.MAIN_BUCKET
            );

            serveFrom = "main"
        }

        await fs.promises.unlink(req.file.path);


        const protocol =
            process.env.NODE_ENV === "production"
                ? "https"
                : "http";

        const publicUrl = `${protocol}://api-devload.cloudcoderhub.in/public/${project._id}/${req.file.filename}`;

        const deleteUrl = `${protocol}://api-devload.cloudcoderhub.in/api/v1/devload/file/${req.file.filename}`;

        const fDeleteUr = `${protocol}://api-devload.cloudcoderhub.in/api/v2/user/file/${req.file.filename}`;

        const downloadeUrl = `${protocol}://api-devload.cloudcoderhub.in/api/v2/file/${req.file.filename}`;

        const newfile = new Model.File({
            originalfilename: req.file.originalname,
            type: fileType,
            filename: req.file.filename,
            size: filesize,
            publicUrl,
            downloadeUrl,
            fDeleteUr,
            deleteUrl,
            projectid: project._id,
            owner: user._id,
            serveFrom,
            underProcessing
        });

        if (!isVideo) {
            await Model.Project.updateOne(
                {
                    userid: user._id,
                    _id: project._id,
                },
                {
                    $inc: {
                        totalUploads: 1,
                        requestsUsed: 1,
                        storageUsed: filesize,
                    },
                }
            );
        }


        await Model.User.updateOne(
            {
                _id: user._id,
                storageUsed: { $lte: user.maxStorage - filesize },
                requestsUsed: { $lt: user.maxRequests },
            },
            {
                $inc: {
                    storageUsed: filesize,
                    requestsUsed: 1,
                },
            }
        );

        await newfile.save();

        res.status(200).json({
            success: true,
            fileid: req.file.filename,
            filename: newfile.originalfilename,
            filesize: `${(filesize / (1024 * 1024)).toFixed(2)} Mb`,
            filetype: newfile.type,
            publicurl: publicUrl,
            downloadeUrl,
            deleteurl: deleteUrl,
        });
    } catch (error) {
        console.log(error);
        fs.unlinkSync(req?.file?.path ?? "");
        return res.status(500).json({
            error: "Internal server Error",
        });
    }
};
