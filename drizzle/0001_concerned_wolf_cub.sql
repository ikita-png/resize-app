CREATE TABLE `image_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`type` enum('original','processed') NOT NULL,
	`url` text NOT NULL,
	`fileKey` varchar(512),
	`fileName` varchar(256),
	`mimeType` varchar(64),
	`width` int,
	`height` int,
	`fileSize` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `image_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `image_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`prompt` text,
	`aspectRatio` varchar(16) DEFAULT 'auto',
	`resolution` enum('1K','2K','4K') DEFAULT '1K',
	`outputFormat` enum('jpeg','png','webp') DEFAULT 'png',
	`imageCount` int DEFAULT 1,
	`notifyOnComplete` int DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completedAt` timestamp,
	CONSTRAINT `image_jobs_id` PRIMARY KEY(`id`)
);
