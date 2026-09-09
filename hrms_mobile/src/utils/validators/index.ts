import * as yup from 'yup';

export const loginSchema = yup.object({ email: yup.string().email('Invalid email').required('Email is required'), password: yup.string().min(8, 'Min 8 characters').required('Password is required') });
export const expenseSchema = yup.object({ category: yup.string().required('Category is required'), amount: yup.number().positive('Must be positive').required('Amount is required'), expenseDate: yup.date().required('Date is required'), description: yup.string().max(500, 'Max 500 characters') });
export const goalSchema = yup.object({ title: yup.string().required('Title is required').max(200), description: yup.string().max(1000), priority: yup.string().required('Priority is required'), category: yup.string().required('Category is required') });
export const wfhRequestSchema = yup.object({ reason: yup.string().required('Reason is required'), notes: yup.string().max(500) });
export const grievanceSchema = yup.object({ category: yup.string().required('Category is required'), priority: yup.string().required('Priority is required'), description: yup.string().required('Description is required').max(2000) });
export const documentUploadSchema = yup.object({ docType: yup.string().required('Document type is required') });

export const validate = async (schema: yup.ObjectSchema<any>, data: unknown): Promise<any> => {
  try { return await schema.validate(data, { abortEarly: false }); }
  catch (error) {
    if (error instanceof yup.ValidationError) {
      const errors: Record<string, string> = {};
      error.inner.forEach((e) => { if (e.path) errors[e.path] = e.message; });
      throw errors;
    }
    throw error;
  }
};
