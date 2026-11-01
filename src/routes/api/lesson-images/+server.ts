import { uploadLessonImage } from '$lib/server/infra/lesson-image-upload';

export const POST = uploadLessonImage('lesson-images');
