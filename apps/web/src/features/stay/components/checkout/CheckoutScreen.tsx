"use client";
import { Card } from "@night-shares/design-system";
import { useSearchParams } from "next/navigation";
import { useCheckout } from "../../hooks/use-checkout";
import { BackLink } from "../shared/BackLink";
import { BookingSuccess } from "./BookingSuccess";
import styles from "./Checkout.module.css";
import { CheckoutForm } from "./CheckoutForm";
import { CheckoutSummary } from "./CheckoutSummary";

export function CheckoutScreen({ propertyId }: { propertyId: string }) {
  const params = useSearchParams();
  return <Checkout key={`${propertyId}:${params}`} propertyId={propertyId} />;
}

// Confirm and pay (.co): the locked stay on the left, guest details and
// payment on the right. After paying, the confirmation replaces both.
function Checkout({ propertyId }: { propertyId: string }) {
  const c = useCheckout(propertyId);
  const trip = c.booking.data?.trip;
  const property = c.model.property.data?.property;
  return (
    <div className={styles.wrap}>
      {trip ? (
        <Card className={styles.successCard}>
          <BookingSuccess trip={trip} property={property} />
        </Card>
      ) : (
        <>
          <BackLink href={c.model.href(`/stay/${propertyId}`)}>
            Back to stay
          </BackLink>
          <Card className={styles.co}>
            <CheckoutSummary c={c} />
            <CheckoutForm c={c} />
          </Card>
        </>
      )}
    </div>
  );
}
