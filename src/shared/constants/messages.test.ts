import { describe, it, expect } from 'vitest';
import { SuccessMessageConstant, ErrorMessageConstant } from './messages';

describe('message constants', () => {
  it('builds success messages', () => {
    expect(SuccessMessageConstant.EntityCreated('Application')).toBe('Application created successfully');
    expect(SuccessMessageConstant.EntityUpdated('Application')).toBe('Application updated successfully');
    expect(SuccessMessageConstant.EntityDeleted('Application')).toBe('Application deleted successfully');
    expect(SuccessMessageConstant.EntityRetrieved('Application')).toBe('Application retrieved successfully');
    expect(SuccessMessageConstant.EntityRetrieved('Applications')).toBe('Applications retrieved successfully');
  });
  it('builds error messages', () => {
    expect(ErrorMessageConstant.DataEntityNotFound('Application')).toBe('Application not found');
    expect(ErrorMessageConstant.ValidationError()).toBe('Validation Error');
    expect(ErrorMessageConstant.FieldRequiredWithName('Company')).toBe('Company is required');
    expect(ErrorMessageConstant.ResourceNotFound()).toBe('Not Found');
    expect(ErrorMessageConstant.InternalServerError()).toBe('Internal Server Error');
  });
});
