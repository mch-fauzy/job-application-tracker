// The single source of response `message` strings. Factories keep wording consistent
// across endpoints and both data paths.

export const SuccessMessageConstant = {
  EntityCreated: (name: string) => `${name} created successfully`,
  EntityUpdated: (name: string) => `${name} updated successfully`,
  EntityDeleted: (name: string) => `${name} deleted successfully`,
  EntityRetrieved: (name: string) => `${name} retrieved successfully`,
} as const;

export const ErrorMessageConstant = {
  DataEntityNotFound: (name: string) => `${name} not found`,
  ValidationError: () => 'Validation Error',
  FieldRequiredWithName: (name: string) => `${name} is required`,
  ResourceNotFound: () => 'Not Found',
  InternalServerError: () => 'Internal Server Error',
} as const;
