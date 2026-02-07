/**
 * Test file for phantom-type-references rule
 * 
 * Contains references to types that don't exist - AI remembered old names
 */

// These types don't exist anywhere in the project
// AI "remembered" them from a previous context or hallucinated them

function processOrder(order: OrderDTO): OrderResponse {
  // OrderDTO and OrderResponse don't exist
  return {
    orderId: order.id,
    status: 'processed',
  };
}

function validatePayment(payment: PaymentRequest): ValidationResult {
  // PaymentRequest and ValidationResult don't exist
  return {
    valid: true,
    errors: [],
  };
}

// Using a type that was renamed
interface ProductData {
  product: ProductEntity;  // ProductEntity doesn't exist, should be Product
  quantity: number;
}

// Referencing types from a module that doesn't export them
function handleUser(user: UserDTO): UserResponseModel {
  // These specific type names don't exist
  return {
    id: user.id,
    success: true,
  };
}

// Function with parameter types that don't exist
async function fetchData(
  config: ApiConfig,
  options: FetchOptions
): Promise<DataResult> {
  // ApiConfig, FetchOptions, DataResult don't exist
  return {} as DataResult;
}

// Class extending a non-existent base class
class OrderProcessor extends BaseProcessor {
  // BaseProcessor doesn't exist
  process(): void {
    console.log('Processing');
  }
}

// Implementing a non-existent interface
class PaymentGateway implements IPaymentProvider {
  // IPaymentProvider doesn't exist
  charge(amount: number): boolean {
    return true;
  }
}
