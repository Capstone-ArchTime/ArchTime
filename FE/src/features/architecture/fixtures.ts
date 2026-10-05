// Sample architecture views used until the abstraction pipeline produces real ones.
// Component edges are derived from the class dependencies below with deriveComponentEdges, exactly as the
// pipeline will do, so these fixtures obey the same "no edge without evidence" rule as real data.
import { deriveComponentEdges } from './derive.ts';
import type { ArchClass, ArchComponent, ArchitectureView, ClassEdge, ComponentRole, DependencyKind, Provenance } from './types.ts';

interface ComponentSpec {
  id: string;
  name: string;
  role: ComponentRole;
  label: Provenance;
  description: string;
  layer?: number;
  classes: string[];
}

function buildView(meta: { projectId: string; snapshotId: string; title: string; basePackage: string }, specs: ComponentSpec[], lines: string[]): ArchitectureView {
  const classes: ArchClass[] = [];
  const components: ArchComponent[] = specs.map(spec => {
    const memberIds = spec.classes.map(name => `${spec.id}.${name}`);
    for (const name of spec.classes) {
      classes.push({ id: `${spec.id}.${name}`, name, componentId: spec.id, path: `src/main/java/${meta.basePackage}/${spec.id}/${name}.java`, kind: 'class' });
    }
    return { id: spec.id, name: spec.name, role: spec.role, label: spec.label, description: spec.description, memberIds, ...(spec.layer === undefined ? {} : { layer: spec.layer }) };
  });
  const pathOf = new Map(classes.map(c => [c.id, c.path]));
  const classEdges: ClassEdge[] = lines.map(line => {
    const m = /^(\S+)>(\S+) (imports|injects|extends|implements|calls) (\d+)$/.exec(line);
    if (!m) throw new Error(`Bad fixture line: ${line}`);
    return { source: m[1], target: m[2], kind: m[3] as DependencyKind, path: pathOf.get(m[1]) ?? '', line: Number(m[4]) };
  });
  const edges = deriveComponentEdges(Object.fromEntries(classes.map(c => [c.id, c.componentId])), classEdges);
  return { schemaVersion: 1, projectId: meta.projectId, snapshotId: meta.snapshotId, title: meta.title, generator: 'fixture', components, edges, classes, classEdges };
}

const shophub = buildView({ projectId: 'sample-shophub', snapshotId: 'a41c9e2', title: 'ShopHub (Spring Boot e-commerce)', basePackage: 'com/shophub' }, [
  { id: 'web', name: 'Web API', role: 'controller', label: 'FACT', layer: 0, description: 'REST controllers that expose orders, catalog, customers and authentication.', classes: ['OrderController', 'CatalogController', 'CustomerController', 'AuthController', 'PaymentWebhookController'] },
  { id: 'auth', name: 'Authentication', role: 'service', label: 'FACT', layer: 1, description: 'Login, JWT issuing and Spring Security configuration.', classes: ['AuthService', 'JwtTokenProvider', 'SecurityConfig', 'UserDetailsServiceImpl'] },
  { id: 'order', name: 'Order Management', role: 'service', label: 'FACT', layer: 1, description: 'Order lifecycle: validation, pricing, status transitions.', classes: ['OrderService', 'OrderValidator', 'OrderStatusMachine', 'OrderMapper'] },
  { id: 'catalog', name: 'Product Catalog', role: 'service', label: 'FACT', layer: 1, description: 'Product lookup, search and price calculation.', classes: ['CatalogService', 'ProductSearchService', 'PriceCalculator'] },
  { id: 'customer', name: 'Customer Accounts', role: 'service', label: 'FACT', layer: 1, description: 'Customer profiles and account data.', classes: ['CustomerService', 'ProfileService'] },
  { id: 'notification', name: 'Notifications', role: 'service', label: 'INFERENCE', layer: 1, description: 'E-mail and SMS notifications. Grouped by naming; no framework annotation confirms the role.', classes: ['NotificationService', 'EmailTemplateRenderer', 'SmsSender'] },
  { id: 'payment', name: 'Payments', role: 'service', label: 'FACT', layer: 2, description: 'Charges and refunds through the payment provider.', classes: ['PaymentService', 'RefundService', 'PaymentMapper'] },
  { id: 'inventory', name: 'Inventory', role: 'service', label: 'FACT', layer: 2, description: 'Stock levels and reservations.', classes: ['InventoryService', 'StockReservation'] },
  { id: 'batch', name: 'Nightly Batch', role: 'other', label: 'UNKNOWN', layer: 2, description: 'Scheduled jobs. The evidence does not show whether these belong to payments or to operations.', classes: ['ReconciliationJob', 'CleanupJob'] },
  { id: 'persistence', name: 'Persistence', role: 'repository', label: 'FACT', layer: 3, description: 'Spring Data repositories and JPA configuration.', classes: ['OrderRepository', 'CustomerRepository', 'ProductRepository', 'StockRepository', 'JpaConfig'] },
  { id: 'messaging', name: 'Event Bus', role: 'gateway', label: 'FACT', layer: 3, description: 'Kafka publishers and listeners.', classes: ['OrderEventPublisher', 'KafkaConfig', 'InventoryEventListener'] },
  { id: 'gateway', name: 'Payment Provider Client', role: 'external', label: 'FACT', layer: 3, description: 'HTTP client and webhook verification for the external payment provider.', classes: ['StripeClient', 'StripeWebhookVerifier'] },
  { id: 'shared', name: 'Shared Kernel', role: 'util', label: 'INFERENCE', layer: 3, description: 'Value objects and helpers used across the system.', classes: ['Money', 'DomainEvent', 'Clock', 'IdGenerator'] },
], [
  'web.OrderController>order.OrderService injects 24', 'web.OrderController>order.OrderMapper injects 25', 'web.OrderController>shared.Money imports 6',
  'web.CatalogController>catalog.CatalogService injects 19', 'web.CatalogController>catalog.ProductSearchService injects 20',
  'web.CustomerController>customer.CustomerService injects 18', 'web.CustomerController>customer.ProfileService injects 19',
  'web.AuthController>auth.AuthService injects 17', 'web.AuthController>auth.JwtTokenProvider injects 18',
  'web.PaymentWebhookController>payment.PaymentService injects 21', 'web.PaymentWebhookController>gateway.StripeWebhookVerifier injects 22',
  'auth.AuthService>customer.CustomerService calls 41', 'auth.UserDetailsServiceImpl>persistence.CustomerRepository injects 15',
  'order.OrderService>payment.PaymentService calls 88', 'order.OrderService>inventory.InventoryService calls 74', 'order.OrderService>notification.NotificationService calls 120',
  'order.OrderService>persistence.OrderRepository injects 33', 'order.OrderService>messaging.OrderEventPublisher injects 34', 'order.OrderService>customer.CustomerService calls 61',
  'order.OrderService>catalog.PriceCalculator calls 67', 'order.OrderValidator>catalog.CatalogService calls 29', 'order.OrderService>shared.Money imports 8',
  'order.OrderStatusMachine>shared.DomainEvent imports 5', 'order.OrderMapper>payment.PaymentMapper calls 17',
  'catalog.CatalogService>persistence.ProductRepository injects 22', 'catalog.ProductSearchService>persistence.ProductRepository injects 16',
  'catalog.PriceCalculator>shared.Money imports 4', 'catalog.CatalogService>shared.Money imports 7',
  'customer.CustomerService>persistence.CustomerRepository injects 20', 'customer.ProfileService>notification.NotificationService calls 38',
  'notification.NotificationService>customer.CustomerService calls 52',
  'payment.PaymentService>gateway.StripeClient injects 28', 'payment.RefundService>gateway.StripeClient injects 19',
  'payment.PaymentService>order.OrderStatusMachine calls 77', 'payment.PaymentService>shared.Money imports 9', 'payment.PaymentService>messaging.OrderEventPublisher calls 91',
  'inventory.InventoryService>persistence.StockRepository injects 17', 'inventory.StockReservation>shared.Clock imports 3', 'inventory.InventoryService>messaging.OrderEventPublisher calls 58',
  'messaging.InventoryEventListener>inventory.InventoryService calls 30', 'messaging.OrderEventPublisher>shared.DomainEvent implements 11',
  'persistence.OrderRepository>shared.Money imports 6', 'persistence.JpaConfig>shared.IdGenerator imports 4', 'gateway.StripeWebhookVerifier>shared.Clock imports 12',
  'batch.ReconciliationJob>payment.PaymentService calls 23', 'batch.ReconciliationJob>persistence.OrderRepository injects 18', 'batch.CleanupJob>persistence.StockRepository injects 14',
]);

const layered = buildView({ projectId: 'sample-ledger', snapshotId: '0b7d310', title: 'Ledger (layered monolith, no cycles)', basePackage: 'com/ledger' }, [
  { id: 'web', name: 'Web', role: 'controller', label: 'FACT', layer: 0, description: 'HTTP controllers.', classes: ['AccountController', 'TransferController'] },
  { id: 'security', name: 'Security', role: 'config', label: 'FACT', layer: 0, description: 'Authentication filters and configuration.', classes: ['SecurityConfig', 'TokenFilter'] },
  { id: 'accounts', name: 'Accounts', role: 'service', label: 'FACT', layer: 1, description: 'Account use cases.', classes: ['AccountService', 'AccountPolicy'] },
  { id: 'transfers', name: 'Transfers', role: 'service', label: 'FACT', layer: 1, description: 'Money movement use cases.', classes: ['TransferService', 'TransferValidator'] },
  { id: 'domain', name: 'Domain Model', role: 'entity', label: 'FACT', layer: 2, description: 'Entities and value objects.', classes: ['Account', 'Transfer', 'Money'] },
  { id: 'persistence', name: 'Persistence', role: 'repository', label: 'FACT', layer: 3, description: 'JPA repositories.', classes: ['AccountRepository', 'TransferRepository'] },
  { id: 'fx', name: 'FX Rates Client', role: 'external', label: 'FACT', layer: 3, description: 'Client for an external exchange-rate API.', classes: ['FxClient'] },
  { id: 'util', name: 'Utilities', role: 'util', label: 'INFERENCE', layer: 3, description: 'Formatting and clock helpers.', classes: ['Clock', 'Formats'] },
], [
  'web.AccountController>accounts.AccountService injects 14', 'web.TransferController>transfers.TransferService injects 16', 'web.TransferController>accounts.AccountService injects 17',
  'security.TokenFilter>accounts.AccountService calls 33', 'accounts.AccountService>domain.Account imports 5', 'accounts.AccountPolicy>domain.Account imports 4',
  'transfers.TransferService>domain.Transfer imports 6', 'transfers.TransferService>accounts.AccountService calls 52', 'transfers.TransferValidator>domain.Money imports 5',
  'transfers.TransferService>fx.FxClient injects 21', 'accounts.AccountService>persistence.AccountRepository injects 18', 'transfers.TransferService>persistence.TransferRepository injects 22',
  'domain.Money>util.Formats imports 3', 'persistence.AccountRepository>domain.Account imports 7', 'persistence.TransferRepository>domain.Transfer imports 7', 'fx.FxClient>util.Clock imports 9',
]);

/** Deterministic 15-component graph used to check layout under load. */
function dense(): ArchitectureView {
  let seed = 11;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const specs: ComponentSpec[] = Array.from({ length: 15 }, (_, i) => ({
    id: `c${String(i + 1).padStart(2, '0')}`, name: `Component ${i + 1}`, role: (['controller', 'service', 'service', 'repository', 'util'] as const)[i % 5], label: 'FACT', description: `Generated component ${i + 1}.`,
    classes: ['Alpha', 'Beta', 'Gamma'],
  }));
  const lines = new Set<string>();
  while (lines.size < 60) {
    const a = specs[Math.floor(rand() * 15)], b = specs[Math.floor(rand() * 15)];
    if (a.id === b.id) continue;
    lines.add(`${a.id}.${a.classes[Math.floor(rand() * 3)]}>${b.id}.${b.classes[Math.floor(rand() * 3)]} calls ${10 + lines.size}`);
  }
  return buildView({ projectId: 'sample-dense', snapshotId: 'ffffff0', title: 'Dense graph (15 components, stress test)', basePackage: 'com/dense' }, specs, [...lines].sort());
}

export interface Fixture { id: string; label: string; view: ArchitectureView }
export const FIXTURES: Fixture[] = [
  { id: 'shophub', label: 'ShopHub: 13 components, with cycles', view: shophub },
  { id: 'ledger', label: 'Ledger: 8 components, layered', view: layered },
  { id: 'dense', label: 'Dense graph: 15 components', view: dense() },
];
export const getFixture = (id: string | undefined): Fixture => FIXTURES.find(f => f.id === id) ?? FIXTURES[0];
